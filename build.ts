import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "data");
const DIST_DIR = join(import.meta.dir, "dist");

// HTML string copied directly from your server template
const HTML_UI = `...YOUR UPDATED FRONTEND HTML HERE...`;

async function build() {
    // 1. Recreate clean dist directory
    await mkdir(DIST_DIR, { recursive: true });
    await writeFile(join(DIST_DIR, "index.html"), HTML_UI);

    try {
        const provinceDirs = await readdir(DATA_DIR, { withFileTypes: true });

        // 2. Build /provinces.json
        const provinces = provinceDirs
            .filter((d) => d.isDirectory() && d.name.startsWith("id"))
            .map((d) => {
                const [, ...rest] = d.name.split("_");
                return { folderName: d.name, name: rest.join(" ").toUpperCase() };
            });

        await writeFile(join(DIST_DIR, "provinces.json"), JSON.stringify(provinces, null, 2));
        await mkdir(join(DIST_DIR, "provinces"), { recursive: true });

        // 3. Loop through every province
        for (const provDir of provinceDirs.filter(d => d.isDirectory() && d.name.startsWith("id"))) {
            const provPath = join(DATA_DIR, provDir.name);
            const provFiles = await readdir(provPath, { withFileTypes: true });

            const districts = provFiles
                .filter((d) => d.isDirectory() && d.name.startsWith("id"))
                .map((d) => {
                    const [, ...rest] = d.name.split("_");
                    return { folderName: d.name, name: rest.join(" ").toUpperCase() };
                });

            const hasProvinceFile = provFiles.some((d) => d.isFile() && d.name.endsWith(".geojson"));

            // Write /provinces/:province.json
            await writeFile(join(DIST_DIR, "provinces", `${provDir.name}.json`), JSON.stringify({ districts, hasProvinceFile }, null, 2));

            // Target path for subdirectories inside this province
            const distProvDir = join(DIST_DIR, "provinces", provDir.name);
            await mkdir(distProvDir, { recursive: true });

            // 4. Build /provinces/:province/data.json
            if (hasProvinceFile) {
                const geojsonFile = provFiles.find((f) => f.isFile() && f.name.endsWith(".geojson"));
                if (geojsonFile) {
                    const content = await readFile(join(provPath, geojsonFile.name), "utf-8");
                    await writeFile(join(distProvDir, "data.json"), content);
                }
            }

            // 5. Loop through every district in this province
            for (const distDir of provFiles.filter(d => d.isDirectory() && d.name.startsWith("id"))) {
                const distPath = join(provPath, distDir.name);
                const subFiles = await readdir(distPath, { withFileTypes: true });
                const allGeojsonFiles = subFiles.filter((f) => f.isFile() && f.name.endsWith(".geojson"));

                if (allGeojsonFiles.length === 0) continue;

                const masterFileName = `${distDir.name}.geojson`;
                let filesToRead = allGeojsonFiles.filter((f) => f.name !== masterFileName);
                if (filesToRead.length === 0) {
                    filesToRead = allGeojsonFiles.filter((f) => f.name === masterFileName);
                }

                // Generate combined features arrays matching your old route logic
                const fileContents = await Promise.all(
                    filesToRead.map(async (file) => {
                        const content = await readFile(join(distPath, file.name), "utf-8");
                        const name = file.name
                            .replace(".geojson", "")
                            .split("_")
                            .map((w) => w[0]?.toUpperCase() + w.slice(1))
                            .slice(1)
                            .join(" ");
                        const data = JSON.parse(content);
                        data.name = name;
                        data.file_name = file.name;
                        return data;
                    })
                );

                const distOutDir = join(distProvDir, distDir.name);
                await mkdir(distOutDir, { recursive: true });

                // Write /provinces/:province/:district/data.json
                await writeFile(
                    join(distOutDir, "data.json"),
                    JSON.stringify({ type: "FeatureCollection", features: fileContents }, null, 2)
                );

                // 6. Copy raw sub-district files for your step-3 drill-down requests
                for (const file of subFiles.filter((f) => f.isFile())) {
                    const fileContent = await readFile(join(distPath, file.name), "utf-8");
                    await writeFile(join(distOutDir, file.name), fileContent);
                }
            }
        }
        console.log("🎉 Static API compilation complete! Check your /dist directory.");
    } catch (err) {
        console.error("Build failed:", err);
    }
}

build();