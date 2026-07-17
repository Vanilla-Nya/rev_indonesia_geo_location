import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "data");
const DIST_DIR = join(import.meta.dir, "dist");

// HTML string copied directly from your server template
const HTML_UI = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Indonesia District API Explorer</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; background: #f4f4f5; }
    header { margin-bottom: 15px; }
    h1 { margin: 0 0 10px 0; font-size: 1.5rem; color: #333; }
    .controls { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
    select { padding: 10px; font-size: 1rem; flex: 1; min-width: 200px; border-radius: 6px; border: 1px solid #ccc; cursor: pointer; }
    select:disabled { background: #e5e7eb; cursor: not-allowed; }
    
    #map-wrapper { position: relative; flex: 1; min-height: 40vh; display: flex; flex-direction: column; border-radius: 12px; border: 2px solid #e4e4e7; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); overflow: hidden; }
    #map { flex: 1; width: 100%; height: 100%; z-index: 1; }
    
    #loading-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.85); z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
    #loading-overlay.active { opacity: 1; pointer-events: all; }
    .spinner { border: 4px solid #e5e7eb; border-top: 4px solid #3b82f6; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 15px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .loading-text { font-size: 1.2rem; font-weight: 600; color: #374151; }

    .json-panel { margin-top: 15px; height: 30vh; display: flex; flex-direction: column; background: #fff; border-radius: 12px; border: 2px solid #e4e4e7; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); overflow: hidden; }
    .json-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: #f8fafc; border-bottom: 1px solid #e4e4e7; }
    .json-header h3 { margin: 0; font-size: 1rem; color: #334155; }
    #copy-btn { background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
    #copy-btn:hover { background: #2563eb; }
    #copy-btn.success { background: #10b981; }
    #copy-btn:disabled { background: #94a3b8; cursor: not-allowed; }
    #json-viewer { flex: 1; padding: 15px; font-family: 'Courier New', Courier, monospace; font-size: 0.85rem; border: none; outline: none; resize: none; background: #f8fafc; color: #334155; white-space: pre; overflow-wrap: normal; overflow-x: auto; }
    
    /* NEW FOOTER STYLES */
    footer { margin-top: auto; padding-top: 20px; padding-bottom: 5px; text-align: center; color: #6b7280; font-size: 0.9rem; }
    .api-path-container { margin-bottom: 8px; display: flex; justify-content: center; align-items: center; gap: 8px; }
    #copy-path-btn { background: #e5e7eb; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; transition: background 0.2s; font-size: 0.85rem; }
    #copy-path-btn:hover { background: #d1d5db; }
    #copy-path-btn.success { background: #10b981; color: white; }
    .api-path-label { font-weight: bold; color: #4b5563; }
    .api-path-code { font-family: 'Courier New', Courier, monospace; background: #e5e7eb; padding: 4px 8px; border-radius: 4px; color: #ef4444; font-weight: bold; }
    .footer-credit { font-weight: 600; color: #3b82f6; }
  </style>
</head>
<body>
  <header>
    <h1>🗺️ Indonesia District Explorer</h1>
  </header>
  
  <div class="controls">
    <select id="province-select"><option value="">1. Select a Province...</option></select>
    <select id="file-select" disabled><option value="">2. Select a District...</option></select>
    <select id="sub-select" disabled><option value="">3. Select a Sub-district...</option></select>
  </div>

  <div id="map-wrapper">
    <div id="map"></div>
    <div id="loading-overlay">
      <div class="spinner"></div>
      <div class="loading-text">Processing Map Data...</div>
    </div>
  </div>

  <div class="json-panel">
    <div class="json-header">
      <h3>Raw GeoJSON Data</h3>
      <button id="copy-btn" disabled>📋 Copy JSON</button>
    </div>
    <textarea id="json-viewer" readonly placeholder="Select a region to view the raw GeoJSON data here..."></textarea>
  </div>

  <footer>
    <div class="api-path-container">
      <span class="api-path-label">Last API Request:</span> 
      <span class="api-path-code" id="api-path-display">/</span>
      <button id="copy-path-btn" title="Copy API Path">📋</button>
    </div>
    <div>&copy; 2026 <span class="footer-credit">Relva Studio</span>. All Rights Reserved.</div>
  </footer>

  <script>
    const map = L.map('map').setView([-2.5489, 118.0149], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);

    let currentGeoJSONLayer = null;
    let currentGeoJSONData = null; 
    let highlightLayer = null;     

    const jsonViewer = document.getElementById('json-viewer');
    const copyBtn = document.getElementById('copy-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const apiPathDisplay = document.getElementById('api-path-display');
    
    function setLoading(isLoading) {
      const selects = document.querySelectorAll('select');
      if (isLoading) {
        loadingOverlay.classList.add('active');
        selects.forEach(s => s.style.pointerEvents = 'none');
        copyBtn.disabled = true;
      } else {
        loadingOverlay.classList.remove('active');
        selects.forEach(s => s.style.pointerEvents = 'all');
        copyBtn.disabled = false;
      }
    }

    function displayJSON(data) {
      jsonViewer.value = JSON.stringify(data, null, 2);
    }

    function updateApiPath(path) {
      apiPathDisplay.textContent = path;
    }

    copyBtn.addEventListener('click', async () => {
      if (!jsonViewer.value) return;
      try {
        await navigator.clipboard.writeText(jsonViewer.value);
        copyBtn.textContent = '✅ Copied!';
        copyBtn.classList.add('success');
        setTimeout(() => { copyBtn.textContent = '📋 Copy JSON'; copyBtn.classList.remove('success'); }, 2000);
      } catch (err) {
        alert('Failed to copy text. You can select it manually.');
      }
    });

    // Initial load
    updateApiPath('/provinces');
    fetch('provinces.json')
      .then(res => res.json())
      .then(provinces => {
        if (provinces.error) return alert("Error: " + provinces.error);
        const provinceSelect = document.getElementById('province-select');
        provinces.forEach(p => {
          const option = document.createElement('option');
          option.value = p.folderName;
          option.textContent = p.name;
          provinceSelect.appendChild(option);
        });
      });

    document.getElementById('province-select').addEventListener('change', (e) => {
      const province = e.target.value;
      const fileSelect = document.getElementById('file-select');
      const subSelect = document.getElementById('sub-select');
      
      fileSelect.innerHTML = '<option value="">2. Select a District...</option>';
      fileSelect.disabled = true;
      subSelect.innerHTML = '<option value="">3. Select a Sub-district...</option>';
      subSelect.disabled = true;
      jsonViewer.value = ''; 
      
      if (currentGeoJSONLayer) map.removeLayer(currentGeoJSONLayer);
      if (highlightLayer) map.removeLayer(highlightLayer);
      if (!province) {
        updateApiPath('/');
        return;
      }

      const fetchUrl = 'provinces/' + province + '.json';
      updateApiPath(fetchUrl);
      
      fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
          if (data.hasProvinceFile) {
            const option = document.createElement('option');
            option.value = '__PROVINCE__';
            option.textContent = '🌟 FULL PROVINCE MAP';
            fileSelect.appendChild(option);
          }
          data.districts.forEach(district => {
            const option = document.createElement('option');
            option.value = district.folderName;
            option.textContent = district.name;
            fileSelect.appendChild(option);
          });
          fileSelect.disabled = false;
        });
    });

    document.getElementById('file-select').addEventListener('change', (e) => {
      const district = e.target.value;
      const province = document.getElementById('province-select').value;
      const subSelect = document.getElementById('sub-select');
      
      subSelect.innerHTML = '<option value="">3. Select a Sub-district...</option>';
      subSelect.disabled = true;
      if (highlightLayer) map.removeLayer(highlightLayer);
      if (currentGeoJSONLayer) map.removeLayer(currentGeoJSONLayer);

      if (!district || !province) {
        jsonViewer.value = '';
        updateApiPath('provinces/' + province + '.json');
        return;
      }

      setLoading(true);
      jsonViewer.value = 'Loading GeoJSON data from server...'; 

      const fetchUrl = district === '__PROVINCE__' 
        ? 'provinces/' + province + '/data.json' 
        : 'provinces/' + province + '/' + district + '/data.json';
        
      updateApiPath(fetchUrl);

      fetch(fetchUrl)
        .then(res => res.json())
        .then(geojsonData => {
          if (geojsonData.error) {
            alert(geojsonData.error);
            setLoading(false);
            jsonViewer.value = '';
            return;
          }

          jsonViewer.value = 'Drawing map, please wait...';
          currentGeoJSONData = geojsonData;

          setTimeout(() => {
            displayJSON(currentGeoJSONData);
            
            currentGeoJSONLayer = L.geoJSON(geojsonData, {
              style: { color: "#3b82f6", weight: 1, fillOpacity: 0.1 }
            }).addTo(map);
            
            map.fitBounds(currentGeoJSONLayer.getBounds());

            if (geojsonData.features && geojsonData.features.length > 0) {
              geojsonData.features.forEach((feature, index) => {
                const props = feature.properties || {};
                const name = props.NAMOBJ || props.WADMKC || props.NAME_3 || props.NAME_4 || props.Desa || feature.name || \`Region \${index + 1}\`;
                const option = document.createElement('option');
                option.value = index; 
                option.textContent = name;
                subSelect.appendChild(option);
              });
              subSelect.disabled = false;
            }

            setLoading(false);
          }, 50); 
        })
        .catch(err => {
          setLoading(false);
          jsonViewer.value = 'Error loading data. Check console.';
          console.error(err);
        });
    });

    document.getElementById('sub-select').addEventListener('change', (e) => {
      const featureIndex = e.target.value;
      if (highlightLayer) map.removeLayer(highlightLayer);

      if (featureIndex === "") {
        map.fitBounds(currentGeoJSONLayer.getBounds());
        displayJSON(currentGeoJSONData);
        return;
      }

      const selectedFeature = currentGeoJSONData.features[featureIndex];
      displayJSON(selectedFeature);
      const fetchUrl = 'provinces/' + document.getElementById('province-select').value + '/' + document.getElementById('file-select').value + '/' + selectedFeature.file_name;
      updateApiPath(fetchUrl);
      
      highlightLayer = L.geoJSON(selectedFeature, {
        style: { color: "#ef4444", weight: 3, fillOpacity: 0.5, fillColor: "#ef4444" }
      }).addTo(map);
      
      map.fitBounds(highlightLayer.getBounds());
    });

    // Add reference at the top with your other variables
    const copyPathBtn = document.getElementById('copy-path-btn');

    // Add this event listener to handle copying the API path
    copyPathBtn.addEventListener('click', async () => {
      const pathText = apiPathDisplay.textContent;
      if (!pathText || pathText === '/') return;
      
      try {
        await navigator.clipboard.writeText(pathText);
        copyPathBtn.textContent = '✅';
        copyPathBtn.classList.add('success');
        
        setTimeout(() => { 
          copyPathBtn.textContent = '📋'; 
          copyPathBtn.classList.remove('success'); 
        }, 2000);
      } catch (err) {
        alert('Failed to copy API path.');
      }
    });
  </script>
</body>
</html>
`;

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