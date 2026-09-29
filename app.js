    const DEFAULT_LAT = 14.545101;
    const DEFAULT_LNG = 121.045733;

    // Default pre-seeded rotundas list
    const DEFAULT_PRESET_LIST = [
      {
        id: 'preset-bgc-mckinley',
        name: 'McKinley Rd & 5th Ave Junction',
        timestamp: 1700000000001,
        isDefault: true,
        state: {
          centerLat: 14.545101,
          centerLng: 121.045733,
          zoom: 18,
          outerRadiusMeters: 18,
          islandRadiusMeters: 7,
          ringLanes: 2,
          legCount: 4,
          globalAngleOffset: 4,
          trafficStandard: 'RHT',
          spawnRatePerMin: 10,
          maxSpeedKmH: 30,
          selectedScenario: 'balanced',
          legs: [
            { id: 0, baseAngle: 0, angleOffset: 0, widthMeters: 18, lengthMeters: 50, flowMode: 'two-way', spawnWeight: 1.2, exitPreference: 'balanced' },
            { id: 1, baseAngle: 90, angleOffset: -17, widthMeters: 18, lengthMeters: 40, flowMode: 'two-way', spawnWeight: 1.0, exitPreference: 'balanced' },
            { id: 2, baseAngle: 180, angleOffset: -12, widthMeters: 18, lengthMeters: 45, flowMode: 'two-way', spawnWeight: 1.2, exitPreference: 'balanced' },
            { id: 3, baseAngle: 270, angleOffset: -6, widthMeters: 18, lengthMeters: 40, flowMode: 'two-way', spawnWeight: 0.8, exitPreference: 'balanced' }
          ]
        }
      }
    ];

    let savedRotundas = [];
    let currentRotundaId = null;
    let lastSavedSnapshot = null;

    function buildStateSnapshot() {
      return {
        centerLat: appState.centerLat,
        centerLng: appState.centerLng,
        zoom: map ? map.getZoom() : appState.zoom,
        outerRadiusMeters: appState.outerRadiusMeters,
        islandRadiusMeters: appState.islandRadiusMeters,
        ringLanes: appState.ringLanes,
        legCount: appState.legCount,
        globalAngleOffset: appState.globalAngleOffset,
        trafficStandard: appState.trafficStandard,
        spawnRatePerMin: appState.spawnRatePerMin,
        maxSpeedKmH: appState.maxSpeedKmH,
        selectedScenario: appState.selectedScenario,
        legs: appState.legs
      };
    }

    function markSnapshotAsSaved() {
      lastSavedSnapshot = JSON.stringify(buildStateSnapshot());
    }

    function isDirty() {
      return JSON.stringify(buildStateSnapshot()) !== lastSavedSnapshot;
    }

    function refreshSaveButtonState() {
      const btn = document.getElementById('btn-open-save-modal');
      const label = document.getElementById('save-btn-label');
      if (!btn) return;
      const dirty = isDirty();
      btn.disabled = !dirty;
      if (label) {
        label.textContent = currentRotundaId ? 'Save Changes' : 'Save Current Setup';
      }
    }

    function loadSavedRotundas() {
      try {
        const saved = localStorage.getItem('rotundasim_saved_list');
        if (saved) {
          savedRotundas = JSON.parse(saved);
          const mckinley = savedRotundas.find(r => r.id === 'preset-bgc-mckinley');
          const mckinleyDefault = DEFAULT_PRESET_LIST.find(r => r.id === 'preset-bgc-mckinley');
          if (mckinley && mckinleyDefault) {
            mckinley.state = JSON.parse(JSON.stringify(mckinleyDefault.state));
            saveSavedRotundasToStorage();
          }
        } else {
          savedRotundas = JSON.parse(JSON.stringify(DEFAULT_PRESET_LIST));
          saveSavedRotundasToStorage();
        }
      } catch (e) {
        console.warn('Unable to load saved rotundas list:', e);
        savedRotundas = JSON.parse(JSON.stringify(DEFAULT_PRESET_LIST));
      }
    }

    function saveSavedRotundasToStorage() {
      try {
        localStorage.setItem('rotundasim_saved_list', JSON.stringify(savedRotundas));
      } catch (e) {
        console.warn('Unable to save rotundas list:', e);
      }
    }

    // Global application state object
    const appState = {
      centerLat: DEFAULT_LAT,
      centerLng: DEFAULT_LNG,
      zoom: 18,
      clickToMove: false,
      outerRadiusMeters: 35,
      islandRadiusMeters: 18,
      ringLanes: 2,
      legCount: 4,
      globalAngleOffset: 0,
      trafficStandard: 'RHT',
      spawnRatePerMin: 45,
      maxSpeedKmH: 35,
      guideLines: true,
      showCrosswalks: true,
      showYieldLines: true,
      simulationRunning: true,
      selectedScenario: 'balanced',
      legs: []
    };

    // Live statistics
    const simStats = {
      totalProcessed: 0,
      activeCarsCount: 0
    };

    let map = null;
    let canvas = null;
    let ctx = null;
    let centerMarker = null;
    let currentTileLayer = null;
    let vehicleAgents = [];
    let lastAnimTime = performance.now();
    let legTipPoints = [];
    let widthHandlePoints = [];
    let draggingLegIdx = null;
    let draggingWidthLegIdx = null;
    let rotundaSelected = false;
    let rotateHandlePoint = null;
    let draggingRotation = false;
    let rotationStartPointerDeg = 0;
    let rotationStartOffset = 0;
    let suppressNextMapClick = false;

    function safeLoadLocalStorage() {
      try {
        const saved = localStorage.getItem('rotundasim_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.centerLat === 14.5472 && parsed.centerLng === 121.0381) {
            parsed.centerLat = DEFAULT_LAT;
            parsed.centerLng = DEFAULT_LNG;
          }
          Object.assign(appState, parsed);
        }
      } catch (e) {
        console.warn('Unable to load saved state:', e);
      }
    }

    function saveStateToLocalStorage() {
      try {
        localStorage.setItem('rotundasim_config', JSON.stringify(appState));
      } catch (e) {
        console.warn('Unable to save state:', e);
      }
    }

    function sanitizeHTML(str) {
      const temp = document.createElement('div');
      temp.textContent = str;
      return temp.innerHTML;
    }

    function initLegsState() {
      appState.legs = [];
      const baseAngles = {
        3: [0, 120, 240],
        4: [0, 90, 180, 270],
        5: [0, 72, 144, 216, 288],
        6: [0, 60, 120, 180, 240, 300]
      }[appState.legCount] || [0, 90, 180, 270];

      for (let i = 0; i < appState.legCount; i++) {
        appState.legs.push({
          id: i,
          angleOffset: 0,
          baseAngle: baseAngles[i],
          widthMeters: 22,
          lengthMeters: 120,
          flowMode: 'two-way',
          spawnWeight: 1.0,
          exitPreference: 'balanced'
        });
      }
    }

    function initMap() {
      map = L.map('map', {
        center: [appState.centerLat, appState.centerLng],
        zoom: appState.zoom,
        zoomControl: false,
        attributionControl: false
      });

      const tileSources = {
        esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{y}/{x}{r}.png',
        light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{y}/{x}{r}.png',
        osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      };

      currentTileLayer = L.tileLayer(tileSources.esri, {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const layerBtns = {
        'layer-btn-esri': tileSources.esri,
        'layer-btn-dark': tileSources.dark,
        'layer-btn-light': tileSources.light,
        'layer-btn-osm': tileSources.osm
      };

      Object.keys(layerBtns).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', () => {
          Object.keys(layerBtns).forEach(id => {
            const b = document.getElementById(id);
            if (b) {
              b.className = "px-2 py-1 rounded text-slate-300 hover:text-white transition-colors";
            }
          });
          btn.className = "px-2 py-1 rounded bg-sky-600 text-white font-medium transition-colors";

          if (currentTileLayer) map.removeLayer(currentTileLayer);
          currentTileLayer = L.tileLayer(layerBtns[btnId], { maxZoom: 19 }).addTo(map);
        });
      });

      const customIcon = L.divIcon({
        className: 'center-marker-icon',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      centerMarker = L.marker([appState.centerLat, appState.centerLng], {
        draggable: true,
        icon: customIcon
      }).addTo(map);

      centerMarker.on('drag', function(e) {
        const latlng = e.target.getLatLng();
        appState.centerLat = latlng.lat;
        appState.centerLng = latlng.lng;
        requestAnimationFrame(render);
      });

      map.on('click', function(e) {
        if (suppressNextMapClick) {
          suppressNextMapClick = false;
          return;
        }

        if (appState.clickToMove) {
          appState.centerLat = e.latlng.lat;
          appState.centerLng = e.latlng.lng;
          centerMarker.setLatLng(e.latlng);
          requestAnimationFrame(render);
          return;
        }

        const pt = map.latLngToContainerPoint(e.latlng);
        rotundaSelected = isPointOnRotunda(pt.x, pt.y);
        updateGlobalLegWidthVisibility();
        requestAnimationFrame(render);
      });

      map.on('move resize zoom', syncCanvasSizeAndRender);

      bindLegDragHandlers();
    }

    function updateGlobalLegWidthVisibility() {
      const block = document.getElementById('global-leg-width-block');
      if (!block) return;
      block.classList.toggle('hidden', !rotundaSelected);
      if (rotundaSelected) {
        const slider = document.getElementById('slider-global-leg-width');
        const val = document.getElementById('val-global-leg-width');
        const firstLeg = appState.legs[0];
        if (slider && firstLeg) slider.value = firstLeg.widthMeters;
        if (val && firstLeg) val.textContent = `${firstLeg.widthMeters} m`;
      }
    }

    function findNearbyLegTip(px, py) {
      if (!rotundaSelected) return null;
      for (const tip of legTipPoints) {
        if (Math.hypot(tip.x - px, tip.y - py) <= 10) return tip.idx;
      }
      return null;
    }

    function findNearbyWidthHandle(px, py) {
      if (!rotundaSelected) return null;
      for (const handle of widthHandlePoints) {
        if (Math.hypot(handle.x - px, handle.y - py) <= 10) return handle.idx;
      }
      return null;
    }

    function isOnRotateHandle(px, py) {
      if (!rotundaSelected || !rotateHandlePoint) return false;
      return Math.hypot(rotateHandlePoint.x - px, rotateHandlePoint.y - py) <= 10;
    }

    function updateGlobalAngleUI() {
      const slider = document.getElementById('slider-global-angle');
      const val = document.getElementById('val-global-angle');
      if (slider) slider.value = appState.globalAngleOffset;
      if (val) val.textContent = `${appState.globalAngleOffset}°`;
    }

    function updateLegLengthUI(idx) {
      const leg = appState.legs[idx];
      if (!leg) return;
      const slider = document.getElementById(`slider-leg-length-${idx}`);
      const label = document.getElementById(`val-leg-length-${idx}`);
      if (slider) slider.value = leg.lengthMeters;
      if (label) label.textContent = `${leg.lengthMeters} m`;
    }

    function updateLegAngleUI(idx) {
      const leg = appState.legs[idx];
      if (!leg) return;
      const slider = document.getElementById(`slider-leg-angle-${idx}`);
      const label = document.getElementById(`val-leg-angle-${idx}`);
      if (slider) slider.value = leg.angleOffset;
      if (label) label.textContent = `${leg.angleOffset}°`;
    }

    function updateLegWidthUI(idx) {
      const leg = appState.legs[idx];
      if (!leg) return;
      const slider = document.getElementById(`slider-leg-width-${idx}`);
      const label = document.getElementById(`val-leg-width-${idx}`);
      if (slider) slider.value = leg.widthMeters;
      if (label) label.textContent = `${leg.widthMeters} m`;
      const globalSlider = document.getElementById('slider-global-leg-width');
      const globalLabel = document.getElementById('val-global-leg-width');
      if (globalSlider) globalSlider.value = leg.widthMeters;
      if (globalLabel) globalLabel.textContent = `${leg.widthMeters} m`;
    }

    function bindLegDragHandlers() {
      const container = map.getContainer();
      let hoveringLegIdx = null;
      let hoveringWidthLegIdx = null;
      let hoveringRotation = false;

      function eventToContainerPoint(e) {
        const rect = container.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      }

      function onWindowMouseMove(e) {
        if (draggingLegIdx === null) return;
        const leg = appState.legs[draggingLegIdx];
        if (!leg) return;
        const pt = eventToContainerPoint(e);
        const centerLatLng = L.latLng(appState.centerLat, appState.centerLng);
        const mouseLatLng = map.containerPointToLatLng([pt.x, pt.y]);
        const meters = map.distance(centerLatLng, mouseLatLng);
        leg.lengthMeters = Math.max(40, Math.min(250, Math.round(meters / 5) * 5));
        updateLegLengthUI(draggingLegIdx);

        // atan2 is unstable within a few px of center, where length is clamped anyway.
        const centerPx = map.latLngToContainerPoint(centerLatLng);
        const nearCenter = Math.hypot(pt.x - centerPx.x, pt.y - centerPx.y) < 12;
        if (!e.shiftKey && !nearCenter) {
          const rawOffset = pointerAngleDeg(pt) - leg.baseAngle - appState.globalAngleOffset;
          leg.angleOffset = Math.round(((rawOffset + 180) % 360 + 360) % 360 - 180);
          updateLegAngleUI(draggingLegIdx);
        }

        requestAnimationFrame(render);
      }

      function onWindowMouseUp() {
        if (draggingLegIdx === null) return;
        draggingLegIdx = null;
        if (hoveringLegIdx === null) map.dragging.enable();
        container.style.cursor = hoveringLegIdx === null ? '' : 'grab';
        window.removeEventListener('mousemove', onWindowMouseMove);
        window.removeEventListener('mouseup', onWindowMouseUp);
        saveStateToLocalStorage();
        requestAnimationFrame(render);
      }

      function onWindowWidthMouseMove(e) {
        if (draggingWidthLegIdx === null) return;
        const leg = appState.legs[draggingWidthLegIdx];
        if (!leg) return;
        const pt = eventToContainerPoint(e);
        const centerLatLng = L.latLng(appState.centerLat, appState.centerLng);
        const centerPx = map.latLngToContainerPoint(centerLatLng);
        const totalAngleDeg = (leg.baseAngle + leg.angleOffset + appState.globalAngleOffset) % 360;
        const rad = (totalAngleDeg * Math.PI) / 180;
        const dx = pt.x - centerPx.x;
        const dy = pt.y - centerPx.y;
        const localX = dx * Math.cos(rad) + dy * Math.sin(rad);
        const pixelsPerMeter = getPixelRadius(centerLatLng, 1);
        const meters = (Math.abs(localX) * 2) / pixelsPerMeter;
        const clamped = Math.max(12, Math.min(50, Math.round(meters)));
        leg.widthMeters = clamped;
        updateLegWidthUI(draggingWidthLegIdx);
        requestAnimationFrame(render);
      }

      function onWindowWidthMouseUp() {
        if (draggingWidthLegIdx === null) return;
        draggingWidthLegIdx = null;
        if (hoveringWidthLegIdx === null) map.dragging.enable();
        container.style.cursor = hoveringWidthLegIdx === null ? '' : 'ew-resize';
        window.removeEventListener('mousemove', onWindowWidthMouseMove);
        window.removeEventListener('mouseup', onWindowWidthMouseUp);
        saveStateToLocalStorage();
        requestAnimationFrame(render);
      }

      function pointerAngleDeg(pt) {
        const centerPx = map.latLngToContainerPoint(L.latLng(appState.centerLat, appState.centerLng));
        return (Math.atan2(pt.x - centerPx.x, -(pt.y - centerPx.y)) * 180) / Math.PI;
      }

      function onWindowRotationMouseMove(e) {
        if (!draggingRotation) return;
        const delta = pointerAngleDeg(eventToContainerPoint(e)) - rotationStartPointerDeg;
        const raw = rotationStartOffset + delta;
        appState.globalAngleOffset = Math.round(((raw + 180) % 360 + 360) % 360 - 180);
        updateGlobalAngleUI();
        requestAnimationFrame(render);
      }

      function onWindowRotationMouseUp() {
        if (!draggingRotation) return;
        draggingRotation = false;
        suppressNextMapClick = true;
        if (!hoveringRotation) map.dragging.enable();
        container.style.cursor = hoveringRotation ? 'grab' : '';
        window.removeEventListener('mousemove', onWindowRotationMouseMove);
        window.removeEventListener('mouseup', onWindowRotationMouseUp);
        saveStateToLocalStorage();
        requestAnimationFrame(render);
      }

      // Proactively disable map panning while hovering a handle, so Leaflet's
      // own mousedown listener (registered before ours) never starts a pan.
      container.addEventListener('mousemove', (e) => {
        if (draggingLegIdx !== null || draggingWidthLegIdx !== null || draggingRotation) return;
        const pt = eventToContainerPoint(e);
        const widthIdx = findNearbyWidthHandle(pt.x, pt.y);
        const idx = widthIdx === null ? findNearbyLegTip(pt.x, pt.y) : null;
        if (widthIdx !== hoveringWidthLegIdx) {
          hoveringWidthLegIdx = widthIdx;
        }
        if (idx !== hoveringLegIdx) {
          hoveringLegIdx = idx;
        }
        hoveringRotation = widthIdx === null && idx === null && isOnRotateHandle(pt.x, pt.y);
        if (widthIdx !== null) {
          map.dragging.disable();
          container.style.cursor = 'ew-resize';
        } else if (idx !== null) {
          map.dragging.disable();
          container.style.cursor = 'grab';
        } else if (hoveringRotation) {
          map.dragging.disable();
          container.style.cursor = 'grab';
        } else {
          map.dragging.enable();
          container.style.cursor = '';
        }
      });

      container.addEventListener('mousedown', (e) => {
        // A drag that ends off-map never emits the trailing click, so clear any
        // stale suppression here rather than swallowing the next real click.
        suppressNextMapClick = false;
        if (hoveringWidthLegIdx !== null) {
          draggingWidthLegIdx = hoveringWidthLegIdx;
          container.style.cursor = 'ew-resize';
          window.addEventListener('mousemove', onWindowWidthMouseMove);
          window.addEventListener('mouseup', onWindowWidthMouseUp);
          return;
        }
        if (hoveringRotation) {
          const pt = eventToContainerPoint(e);
          draggingRotation = true;
          rotationStartPointerDeg = pointerAngleDeg(pt);
          rotationStartOffset = appState.globalAngleOffset;
          container.style.cursor = 'grabbing';
          window.addEventListener('mousemove', onWindowRotationMouseMove);
          window.addEventListener('mouseup', onWindowRotationMouseUp);
          return;
        }
        if (hoveringLegIdx === null) return;
        draggingLegIdx = hoveringLegIdx;
        container.style.cursor = 'ns-resize';
        window.addEventListener('mousemove', onWindowMouseMove);
        window.addEventListener('mouseup', onWindowMouseUp);
      });
    }

    function initCanvas() {
      canvas = document.getElementById('rotunda-canvas');
      ctx = canvas.getContext('2d');
      syncCanvasSizeAndRender();
    }

    function syncCanvasSizeAndRender() {
      if (!canvas || !map) return;
      const mapContainer = map.getContainer();
      canvas.width = mapContainer.clientWidth;
      canvas.height = mapContainer.clientHeight;
      requestAnimationFrame(render);
    }

    function getPixelRadius(latLng, radiusMeters) {
      const centerPoint = map.latLngToContainerPoint(latLng);
      const latOffset = (radiusMeters / 6378137) * (180 / Math.PI);
      const offsetLatLng = L.latLng(latLng.lat + latOffset, latLng.lng);
      const offsetPoint = map.latLngToContainerPoint(offsetLatLng);
      const pxDistance = Math.hypot(centerPoint.x - offsetPoint.x, centerPoint.y - offsetPoint.y);
      return Math.max(pxDistance, 2);
    }

    function isPointOnRotunda(px, py) {
      const centerLatLng = L.latLng(appState.centerLat, appState.centerLng);
      const centerPx = map.latLngToContainerPoint(centerLatLng);
      const outerPx = getPixelRadius(centerLatLng, appState.outerRadiusMeters);

      if (Math.hypot(px - centerPx.x, py - centerPx.y) <= outerPx) return true;

      for (const leg of appState.legs) {
        const totalAngleDeg = (leg.baseAngle + leg.angleOffset + appState.globalAngleOffset) % 360;
        const rad = (totalAngleDeg * Math.PI) / 180;
        const legWidthPx = getPixelRadius(centerLatLng, leg.widthMeters);
        const legLengthPx = getPixelRadius(centerLatLng, leg.lengthMeters || 120);

        const dx = px - centerPx.x;
        const dy = py - centerPx.y;
        const localX = dx * Math.cos(rad) + dy * Math.sin(rad);
        const localY = -dx * Math.sin(rad) + dy * Math.cos(rad);

        if (localX >= -legWidthPx / 2 && localX <= legWidthPx / 2 && localY <= 0 && localY >= -legLengthPx) {
          return true;
        }
      }

      return false;
    }

    function bindUIControls() {
      // Tab Switching
      const tabs = [
        { btn: 'tab-btn-geom', content: 'tab-content-geom' },
        { btn: 'tab-btn-flow', content: 'tab-content-flow' },
        { btn: 'tab-btn-saved', content: 'tab-content-saved' }
      ];

      tabs.forEach(tab => {
        const btnEl = document.getElementById(tab.btn);
        if (!btnEl) return;
        btnEl.addEventListener('click', () => {
          tabs.forEach(t => {
            const b = document.getElementById(t.btn);
            const c = document.getElementById(t.content);
            if (b && c) {
              if (t.btn === tab.btn) {
                b.classList.add('text-sky-400', 'border-sky-500');
                b.classList.remove('text-slate-400', 'border-transparent');
                c.classList.remove('hidden');
              } else {
                b.classList.remove('text-sky-400', 'border-sky-500');
                b.classList.add('text-slate-400', 'border-transparent');
                c.classList.add('hidden');
              }
            }
          });
        });
      });

      // Simulation Pause/Play Button
      const toggleSimBtn = document.getElementById('toggle-sim-mode-btn');
      const simBtnIcon = document.getElementById('sim-btn-icon');
      const simBtnLabel = document.getElementById('sim-btn-label');
      if (toggleSimBtn) {
        toggleSimBtn.addEventListener('click', () => {
          appState.simulationRunning = !appState.simulationRunning;
          if (appState.simulationRunning) {
            simBtnIcon.className = "fa-solid fa-pause";
            simBtnLabel.textContent = "Pause Simulation";
            toggleSimBtn.className = "flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors shadow-lg shadow-sky-600/20";
          } else {
            simBtnIcon.className = "fa-solid fa-play";
            simBtnLabel.textContent = "Resume Simulation";
            toggleSimBtn.className = "flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors shadow-lg shadow-amber-600/20";
          }
        });
      }

      // Outer Radius Slider
      const sliderOuter = document.getElementById('slider-outer-radius');
      if (sliderOuter) {
        sliderOuter.addEventListener('input', (e) => {
          appState.outerRadiusMeters = parseInt(e.target.value, 10);
          document.getElementById('val-outer-radius').textContent = `${appState.outerRadiusMeters} m`;
          requestAnimationFrame(render);
        });
      }

      // Island Radius Slider
      const sliderIsland = document.getElementById('slider-island-radius');
      if (sliderIsland) {
        sliderIsland.addEventListener('input', (e) => {
          appState.islandRadiusMeters = parseInt(e.target.value, 10);
          document.getElementById('val-island-radius').textContent = `${appState.islandRadiusMeters} m`;
          requestAnimationFrame(render);
        });
      }

      // Global Leg Width Slider (all legs, only shown when rotunda selected)
      const sliderGlobalLegWidth = document.getElementById('slider-global-leg-width');
      if (sliderGlobalLegWidth) {
        sliderGlobalLegWidth.addEventListener('input', (e) => {
          const width = parseInt(e.target.value, 10);
          document.getElementById('val-global-leg-width').textContent = `${width} m`;
          appState.legs.forEach((leg, idx) => {
            leg.widthMeters = width;
            const perLegSlider = document.getElementById(`slider-leg-width-${idx}`);
            const perLegVal = document.getElementById(`val-leg-width-${idx}`);
            if (perLegSlider) perLegSlider.value = width;
            if (perLegVal) perLegVal.textContent = `${width} m`;
          });
          requestAnimationFrame(render);
        });
      }

      // Ring Lanes Dropdown
      const selectRingLanes = document.getElementById('select-ring-lanes');
      if (selectRingLanes) {
        selectRingLanes.addEventListener('change', (e) => {
          appState.ringLanes = parseInt(e.target.value, 10);
          requestAnimationFrame(render);
        });
      }

      // Approach Legs Count Dropdown
      const selectLegCount = document.getElementById('select-leg-count');
      if (selectLegCount) {
        selectLegCount.addEventListener('change', (e) => {
          appState.legCount = parseInt(e.target.value, 10);
          initLegsState();
          vehicleAgents = [];
          renderPerLegUIControls();
          requestAnimationFrame(render);
        });
      }

      // Global Angle Offset Slider
      const sliderAngle = document.getElementById('slider-global-angle');
      if (sliderAngle) {
        sliderAngle.addEventListener('input', (e) => {
          appState.globalAngleOffset = parseInt(e.target.value, 10);
          updateGlobalAngleUI();
          requestAnimationFrame(render);
        });
      }

      // Traffic Standard Buttons (RHT / LHT)
      const btnRHT = document.getElementById('btn-traffic-rht');
      const btnLHT = document.getElementById('btn-traffic-lht');
      if (btnRHT && btnLHT) {
        btnRHT.addEventListener('click', () => {
          appState.trafficStandard = 'RHT';
          btnRHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-sky-600/30 border-sky-500 text-sky-300";
          btnLHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-800 border-slate-700 text-slate-400";
          vehicleAgents = [];
          requestAnimationFrame(render);
        });
        btnLHT.addEventListener('click', () => {
          appState.trafficStandard = 'LHT';
          btnLHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-sky-600/30 border-sky-500 text-sky-300";
          btnRHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-800 border-slate-700 text-slate-400";
          vehicleAgents = [];
          requestAnimationFrame(render);
        });
      }

      // Enable Click-to-Move Toggle
      const clickMoveToggle = document.getElementById('toggle-click-move');
      const clickMoveBanner = document.getElementById('click-move-banner');
      if (clickMoveToggle) {
        clickMoveToggle.addEventListener('change', (e) => {
          appState.clickToMove = e.target.checked;
          clickMoveBanner.classList.toggle('hidden', !appState.clickToMove);
        });
      }

      // Display Toggles
      const toggleGuides = document.getElementById('toggle-guide-lines');
      if (toggleGuides) {
        toggleGuides.addEventListener('change', (e) => {
          appState.guideLines = e.target.checked;
          requestAnimationFrame(render);
        });
      }

      // Spawn Rate Slider
      const sliderSpawn = document.getElementById('slider-spawn-rate');
      if (sliderSpawn) {
        sliderSpawn.addEventListener('input', (e) => {
          appState.spawnRatePerMin = parseInt(e.target.value, 10);
          document.getElementById('val-spawn-rate').textContent = `${appState.spawnRatePerMin} / min`;
        });
      }

      // Max Speed Slider
      const sliderSpeed = document.getElementById('slider-max-speed');
      if (sliderSpeed) {
        sliderSpeed.addEventListener('input', (e) => {
          appState.maxSpeedKmH = parseInt(e.target.value, 10);
          document.getElementById('val-max-speed').textContent = `${appState.maxSpeedKmH} km/h`;
        });
      }

      // Rush Hour Scenarios
      const scenarioAM = document.getElementById('scenario-btn-am');
      const scenarioPM = document.getElementById('scenario-btn-pm');
      const scenarioCorridor = document.getElementById('scenario-btn-corridor');
      const scenarioBalanced = document.getElementById('scenario-btn-balanced');

      if (scenarioAM) scenarioAM.addEventListener('click', () => applyRushHourScenario('am-rush'));
      if (scenarioPM) scenarioPM.addEventListener('click', () => applyRushHourScenario('pm-rush'));
      if (scenarioCorridor) scenarioCorridor.addEventListener('click', () => applyRushHourScenario('arterial'));
      if (scenarioBalanced) scenarioBalanced.addEventListener('click', () => applyRushHourScenario('balanced'));

      // Save Modal Trigger
      const openSaveModalBtn = document.getElementById('btn-open-save-modal');
      const closeSaveModalBtn = document.getElementById('btn-close-save-modal');
      const cancelSaveBtn = document.getElementById('btn-cancel-save');
      const confirmSaveBtn = document.getElementById('btn-confirm-save');
      const saveModal = document.getElementById('save-modal');
      const saveNameInput = document.getElementById('save-rotunda-name');
      const saveErrorMsg = document.getElementById('save-modal-error');

      const saveModeModal = document.getElementById('save-mode-modal');
      const closeSaveModeModalBtn = document.getElementById('btn-close-save-mode-modal');
      const saveModeUpdateBtn = document.getElementById('btn-save-mode-update');
      const saveModeNewBtn = document.getElementById('btn-save-mode-new');
      const saveModeCancelBtn = document.getElementById('btn-save-mode-cancel');

      const confirmDeleteModal = document.getElementById('confirm-delete-modal');
      const confirmDeleteText = document.getElementById('confirm-delete-text');
      const closeConfirmDeleteModalBtn = document.getElementById('btn-close-confirm-delete-modal');
      const cancelDeleteBtn = document.getElementById('btn-cancel-delete');
      const confirmDeleteBtn = document.getElementById('btn-confirm-delete');
      let pendingDeleteId = null;

      const limitReachedModal = document.getElementById('limit-reached-modal');
      const closeLimitModalBtn = document.getElementById('btn-close-limit-modal');
      const okLimitBtn = document.getElementById('btn-ok-limit');

      const MAX_SAVED_ROTUNDAS = 5;

      function openModal() {
        if (!saveModal || !saveNameInput) return;
        saveNameInput.value = '';
        if (saveErrorMsg) saveErrorMsg.classList.add('hidden');
        saveModal.classList.remove('hidden');
        setTimeout(() => saveNameInput.focus(), 50);
      }

      function closeModal() {
        if (saveModal) saveModal.classList.add('hidden');
      }

      function closeSaveModeModal() {
        if (saveModeModal) saveModeModal.classList.add('hidden');
      }

      function openLimitReachedModal() {
        if (limitReachedModal) limitReachedModal.classList.remove('hidden');
      }

      function closeLimitReachedModal() {
        if (limitReachedModal) limitReachedModal.classList.add('hidden');
      }

      function openDeleteConfirm(id, name) {
        pendingDeleteId = id;
        if (confirmDeleteText) {
          confirmDeleteText.textContent = `Delete "${name}"? This cannot be undone.`;
        }
        if (confirmDeleteModal) confirmDeleteModal.classList.remove('hidden');
      }

      function closeDeleteConfirm() {
        pendingDeleteId = null;
        if (confirmDeleteModal) confirmDeleteModal.classList.add('hidden');
      }

      window.openDeleteConfirm = openDeleteConfirm;

      function handleSaveClick() {
        if (openSaveModalBtn && openSaveModalBtn.disabled) return;

        const currentEntry = currentRotundaId ? savedRotundas.find(r => r.id === currentRotundaId) : null;

        if (currentEntry && !currentEntry.isDefault) {
          if (saveModeModal) saveModeModal.classList.remove('hidden');
          return;
        }

        if (savedRotundas.length >= MAX_SAVED_ROTUNDAS) {
          openLimitReachedModal();
          return;
        }

        openModal();
      }

      if (openSaveModalBtn) openSaveModalBtn.addEventListener('click', handleSaveClick);
      if (closeSaveModalBtn) closeSaveModalBtn.addEventListener('click', closeModal);
      if (cancelSaveBtn) cancelSaveBtn.addEventListener('click', closeModal);

      if (closeSaveModeModalBtn) closeSaveModeModalBtn.addEventListener('click', closeSaveModeModal);
      if (saveModeCancelBtn) saveModeCancelBtn.addEventListener('click', closeSaveModeModal);
      if (saveModeUpdateBtn) {
        saveModeUpdateBtn.addEventListener('click', () => {
          closeSaveModeModal();
          updateCurrentRotunda();
        });
      }
      if (saveModeNewBtn) {
        saveModeNewBtn.addEventListener('click', () => {
          closeSaveModeModal();
          if (savedRotundas.length >= MAX_SAVED_ROTUNDAS) {
            openLimitReachedModal();
            return;
          }
          openModal();
        });
      }

      if (closeLimitModalBtn) closeLimitModalBtn.addEventListener('click', closeLimitReachedModal);
      if (okLimitBtn) okLimitBtn.addEventListener('click', closeLimitReachedModal);

      if (closeConfirmDeleteModalBtn) closeConfirmDeleteModalBtn.addEventListener('click', closeDeleteConfirm);
      if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteConfirm);
      if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
          if (!pendingDeleteId) return;
          savedRotundas = savedRotundas.filter(r => r.id !== pendingDeleteId);
          saveSavedRotundasToStorage();
          if (currentRotundaId === pendingDeleteId) {
            currentRotundaId = null;
            lastSavedSnapshot = null;
            refreshSaveButtonState();
          }
          closeDeleteConfirm();
          renderSavedRotundas();
        });
      }

      if (saveNameInput) {
        saveNameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') confirmSave();
          if (e.key === 'Escape') closeModal();
        });
      }

      if (confirmSaveBtn) confirmSaveBtn.addEventListener('click', confirmSave);

      function updateCurrentRotunda() {
        const entry = savedRotundas.find(r => r.id === currentRotundaId);
        if (!entry) return;
        entry.state = buildStateSnapshot();
        entry.state.legs = JSON.parse(JSON.stringify(appState.legs));
        entry.timestamp = Date.now();
        saveSavedRotundasToStorage();
        renderSavedRotundas();
        markSnapshotAsSaved();
        refreshSaveButtonState();
      }

      function confirmSave() {
        const name = saveNameInput.value.trim();
        if (!name) {
          if (saveErrorMsg) {
            saveErrorMsg.textContent = "Please enter a valid rotunda name.";
            saveErrorMsg.classList.remove('hidden');
          }
          return;
        }

        if (savedRotundas.length >= MAX_SAVED_ROTUNDAS) {
          closeModal();
          openLimitReachedModal();
          return;
        }

        const newRotunda = {
          id: 'rotunda_' + Date.now(),
          name: name,
          timestamp: Date.now(),
          isDefault: false,
          state: buildStateSnapshot()
        };
        newRotunda.state.legs = JSON.parse(JSON.stringify(appState.legs));

        savedRotundas.unshift(newRotunda);
        saveSavedRotundasToStorage();
        currentRotundaId = newRotunda.id;
        markSnapshotAsSaved();
        refreshSaveButtonState();
        renderSavedRotundas();
        closeModal();
      }

      // Location Search
      const searchBtn = document.getElementById('search-btn');
      const searchInput = document.getElementById('location-search-input');
      if (searchBtn && searchInput) {
        const handleSearch = async () => {
          const query = searchInput.value.trim();
          if (!query) return;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data && data.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lon = parseFloat(data[0].lon);
              appState.centerLat = lat;
              appState.centerLng = lon;
              if (map) map.setView([lat, lon], 18);
              if (centerMarker) centerMarker.setLatLng([lat, lon]);
              requestAnimationFrame(render);
            }
          } catch (e) {
            console.warn('Geocoding search failed:', e);
          }
        };

        searchBtn.addEventListener('click', handleSearch);
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleSearch();
        });
      }

      // Set Default Location
      const setDefaultBtn = document.getElementById('set-default-loc-btn');
      if (setDefaultBtn) {
        setDefaultBtn.addEventListener('click', () => {
          saveStateToLocalStorage();
          alert('Current location set as default startup view!');
        });
      }

      // Reset Storage
      const resetStorageBtn = document.getElementById('reset-storage-btn');
      if (resetStorageBtn) {
        resetStorageBtn.addEventListener('click', () => {
          localStorage.removeItem('rotundasim_config');
          localStorage.removeItem('rotundasim_saved_list');
          location.reload();
        });
      }
    }

    function renderSavedRotundas() {
      const container = document.getElementById('saved-rotundas-container');
      if (!container) return;
      container.innerHTML = '';

      const sortedList = [...savedRotundas].sort((a, b) => b.timestamp - a.timestamp);

      if (sortedList.length === 0) {
        container.innerHTML = `
          <div class="p-4 text-center bg-slate-800/40 border border-slate-800 rounded-xl text-slate-400 text-xs">
            No saved rotundas found. Click "Save Current Setup" above to store one!
          </div>
        `;
        return;
      }

      sortedList.forEach((item) => {
        const card = document.createElement('div');
        card.className = "p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700/80 transition-all space-y-2 group shadow-sm";

        const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Preset';

        const st = item.state || {};
        const legInfo = st.legCount ? `${st.legCount} Legs` : '4 Legs';
        const ringInfo = st.ringLanes ? `${st.ringLanes} Lane Ring` : '2 Lane Ring';
        const radiusInfo = st.outerRadiusMeters ? `${st.outerRadiusMeters}m Outer` : '';

        card.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-0.5">
              <div class="text-xs font-bold text-slate-100 group-hover:text-sky-300 transition-colors flex items-center gap-1.5">
                ${item.isDefault ? '<i class="fa-solid fa-star text-amber-400 text-[10px]"></i>' : '<i class="fa-solid fa-bookmark text-sky-400 text-[10px]"></i>'}
                ${sanitizeHTML(item.name)}
              </div>
              <div class="text-[10px] text-slate-400 flex items-center gap-2">
                <span><i class="fa-solid fa-clock text-[9px] mr-0.5"></i> ${dateStr}</span>
              </div>
            </div>
            ${!item.isDefault ? `
              <button data-delete-id="${item.id}" class="btn-delete-rotunda text-slate-500 hover:text-rose-400 p-1 transition-colors" title="Delete Saved Setup">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            ` : ''}
          </div>

          <div class="flex items-center gap-1.5 text-[10px] text-slate-300 pt-0.5">
            <span class="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded font-mono">${legInfo}</span>
            <span class="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded font-mono">${ringInfo}</span>
            ${radiusInfo ? `<span class="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded font-mono">${radiusInfo}</span>` : ''}
          </div>

          <button data-load-id="${item.id}" class="btn-load-rotunda w-full py-1.5 bg-slate-900 hover:bg-sky-600/30 hover:border-sky-500/50 border border-slate-700 text-sky-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all">
            <i class="fa-solid fa-location-dot"></i> Load into Simulator
          </button>
        `;

        container.appendChild(card);
      });

      container.querySelectorAll('.btn-load-rotunda').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-load-id');
          const target = savedRotundas.find(r => r.id === id);
          if (target && target.state) {
            applyRotundaConfig(target.state, target.id);
          }
        });
      });

      container.querySelectorAll('.btn-delete-rotunda').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-delete-id');
          const target = savedRotundas.find(r => r.id === id);
          openDeleteConfirm(id, target ? target.name : '');
        });
      });
    }

    function assignStateFields(state) {
      appState.centerLat = state.centerLat ?? DEFAULT_LAT;
      appState.centerLng = state.centerLng ?? DEFAULT_LNG;
      appState.outerRadiusMeters = state.outerRadiusMeters ?? 35;
      appState.islandRadiusMeters = state.islandRadiusMeters ?? 18;
      appState.ringLanes = state.ringLanes ?? 2;
      appState.legCount = state.legCount ?? 4;
      appState.globalAngleOffset = state.globalAngleOffset ?? 0;
      appState.trafficStandard = state.trafficStandard ?? 'RHT';
      appState.spawnRatePerMin = state.spawnRatePerMin ?? 45;
      appState.maxSpeedKmH = state.maxSpeedKmH ?? 35;
      appState.selectedScenario = state.selectedScenario ?? 'balanced';

      if (state.legs && Array.isArray(state.legs)) {
        appState.legs = JSON.parse(JSON.stringify(state.legs));
      } else {
        initLegsState();
      }
    }

    function applyRotundaConfig(state, rotundaId) {
      if (!state) return;

      assignStateFields(state);
      currentRotundaId = rotundaId ?? null;

      vehicleAgents = [];

      if (map) {
        map.setView([appState.centerLat, appState.centerLng], state.zoom || 18);
      }
      if (centerMarker) {
        centerMarker.setLatLng([appState.centerLat, appState.centerLng]);
      }

      syncUIFromState();
      renderPerLegUIControls();
      saveStateToLocalStorage();
      markSnapshotAsSaved();
      refreshSaveButtonState();
      requestAnimationFrame(render);
    }

    function syncUIFromState() {
      const sliderOuter = document.getElementById('slider-outer-radius');
      const valOuter = document.getElementById('val-outer-radius');
      if (sliderOuter && valOuter) {
        sliderOuter.value = appState.outerRadiusMeters;
        valOuter.textContent = `${appState.outerRadiusMeters} m`;
      }

      const sliderIsland = document.getElementById('slider-island-radius');
      const valIsland = document.getElementById('val-island-radius');
      if (sliderIsland && valIsland) {
        sliderIsland.value = appState.islandRadiusMeters;
        valIsland.textContent = `${appState.islandRadiusMeters} m`;
      }

      const selectLanes = document.getElementById('select-ring-lanes');
      if (selectLanes) selectLanes.value = appState.ringLanes;

      const selectLegs = document.getElementById('select-leg-count');
      if (selectLegs) selectLegs.value = appState.legCount;

      const sliderAngle = document.getElementById('slider-global-angle');
      const valAngle = document.getElementById('val-global-angle');
      if (sliderAngle && valAngle) {
        sliderAngle.value = appState.globalAngleOffset;
        valAngle.textContent = `${appState.globalAngleOffset}°`;
      }

      const btnRHT = document.getElementById('btn-traffic-rht');
      const btnLHT = document.getElementById('btn-traffic-lht');
      if (btnRHT && btnLHT) {
        if (appState.trafficStandard === 'RHT') {
          btnRHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-sky-600/30 border-sky-500 text-sky-300";
          btnLHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-800 border-slate-700 text-slate-400";
        } else {
          btnLHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-sky-600/30 border-sky-500 text-sky-300";
          btnRHT.className = "py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-800 border-slate-700 text-slate-400";
        }
      }

      const sliderSpawn = document.getElementById('slider-spawn-rate');
      const valSpawn = document.getElementById('val-spawn-rate');
      if (sliderSpawn && valSpawn) {
        sliderSpawn.value = appState.spawnRatePerMin;
        valSpawn.textContent = `${appState.spawnRatePerMin} / min`;
      }

      const sliderMaxSpeed = document.getElementById('slider-max-speed');
      const valMaxSpeed = document.getElementById('val-max-speed');
      if (sliderMaxSpeed && valMaxSpeed) {
        sliderMaxSpeed.value = appState.maxSpeedKmH;
        valMaxSpeed.textContent = `${appState.maxSpeedKmH} km/h`;
      }
    }

    function applyRushHourScenario(scenarioKey) {
      appState.selectedScenario = scenarioKey;
      const badge = document.getElementById('current-scenario-badge');

      ['scenario-btn-am', 'scenario-btn-pm', 'scenario-btn-corridor', 'scenario-btn-balanced'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.className = "p-2 rounded-lg border text-left bg-slate-800 hover:bg-slate-700/80 border-slate-700 transition-colors";
      });

      if (scenarioKey === 'am-rush') {
        if (badge) badge.textContent = 'AM Rush (Inbound Heavy)';
        const activeBtn = document.getElementById('scenario-btn-am');
        if (activeBtn) activeBtn.className = "p-2 rounded-lg border text-left bg-amber-950/60 border-amber-500/50 text-amber-300 transition-colors";
        
        appState.legs.forEach((leg, idx) => {
          if (idx === 0 || idx === 1) {
            leg.spawnWeight = 2.8;
            leg.exitPreference = 'opposite';
          } else {
            leg.spawnWeight = 0.4;
            leg.exitPreference = 'balanced';
          }
        });
      } else if (scenarioKey === 'pm-rush') {
        if (badge) badge.textContent = 'PM Rush (Outbound Heavy)';
        const activeBtn = document.getElementById('scenario-btn-pm');
        if (activeBtn) activeBtn.className = "p-2 rounded-lg border text-left bg-indigo-950/60 border-indigo-500/50 text-indigo-300 transition-colors";

        appState.legs.forEach((leg, idx) => {
          if (idx >= 2) {
            leg.spawnWeight = 2.8;
            leg.exitPreference = 'opposite';
          } else {
            leg.spawnWeight = 0.4;
            leg.exitPreference = 'balanced';
          }
        });
      } else if (scenarioKey === 'arterial') {
        if (badge) badge.textContent = 'Arterial Corridor';
        const activeBtn = document.getElementById('scenario-btn-corridor');
        if (activeBtn) activeBtn.className = "p-2 rounded-lg border text-left bg-rose-950/60 border-rose-500/50 text-rose-300 transition-colors";

        appState.legs.forEach((leg, idx) => {
          if (idx === 0 || idx === 2) {
            leg.spawnWeight = 3.0;
            leg.exitPreference = 'opposite';
          } else {
            leg.spawnWeight = 0.3;
            leg.exitPreference = 'turn-right';
          }
        });
      } else {
        if (badge) badge.textContent = 'Balanced Off-Peak';
        const activeBtn = document.getElementById('scenario-btn-balanced');
        if (activeBtn) activeBtn.className = "p-2 rounded-lg border text-left bg-sky-950/60 border-sky-500/50 text-sky-300 transition-colors";

        appState.legs.forEach(leg => {
          leg.spawnWeight = 1.0;
          leg.exitPreference = 'balanced';
        });
      }

      renderPerLegUIControls();
      requestAnimationFrame(render);
    }

    function renderPerLegUIControls() {
      const container = document.getElementById('per-leg-controls-container');
      if (!container) return;
      container.innerHTML = '';

      appState.legs.forEach((leg, idx) => {
        const legCard = document.createElement('div');
        legCard.className = "p-2.5 bg-slate-800/80 rounded-lg border border-slate-700/70 space-y-2.5";

        const currentAngle = (leg.baseAngle + leg.angleOffset + appState.globalAngleOffset + 360) % 360;
        const spawnWeightVal = leg.spawnWeight !== undefined ? leg.spawnWeight : 1.0;

        legCard.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-sky-400 flex items-center gap-1.5">
              <i class="fa-solid fa-road text-[11px]"></i> Leg ${idx + 1}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${spawnWeightVal > 1.8 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-700 text-slate-300'} font-mono">
                ${spawnWeightVal > 1.8 ? 'PEAK FLOW' : `${Math.round(spawnWeightVal * 100)}% Demand`}
              </span>
              <span class="text-[11px] font-mono font-semibold text-slate-300">${Math.round(currentAngle)}°</span>
            </div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] text-slate-400 block">Primary Destination Route</label>
            <select id="select-leg-exit-${idx}" class="w-full bg-slate-900 border border-slate-700 rounded text-[11px] p-1 text-slate-200">
              <option value="balanced" ${leg.exitPreference === 'balanced' ? 'selected' : ''}>Balanced / Equal Distribute</option>
              <option value="opposite" ${leg.exitPreference === 'opposite' ? 'selected' : ''}>Through Highway (Opposite Leg)</option>
              <option value="turn-right" ${leg.exitPreference === 'turn-right' ? 'selected' : ''}>Heavy Right Turn Bias</option>
              <option value="turn-left" ${leg.exitPreference === 'turn-left' ? 'selected' : ''}>Heavy Left Turn Bias</option>
            </select>
          </div>

          <div class="space-y-1">
            <div class="flex justify-between text-[10px] text-slate-400">
              <span>Angle Offset</span>
              <span id="val-leg-angle-${idx}" class="font-mono text-sky-300">${leg.angleOffset}°</span>
            </div>
            <input id="slider-leg-angle-${idx}" type="range" min="-180" max="180" step="1" value="${leg.angleOffset}" class="w-full accent-sky-500 bg-slate-700 h-1 rounded-lg">
          </div>

          <div class="space-y-1">
            <div class="flex justify-between text-[10px] text-slate-400">
              <span>Road Width</span>
              <span id="val-leg-width-${idx}" class="font-mono text-emerald-300">${leg.widthMeters} m</span>
            </div>
            <input id="slider-leg-width-${idx}" type="range" min="12" max="50" step="1" value="${leg.widthMeters}" class="w-full accent-emerald-500 bg-slate-700 h-1 rounded-lg">
          </div>

          <div class="space-y-1">
            <div class="flex justify-between text-[10px] text-slate-400">
              <span>Leg Length</span>
              <span id="val-leg-length-${idx}" class="font-mono text-purple-300">${leg.lengthMeters || 120} m</span>
            </div>
            <input id="slider-leg-length-${idx}" type="range" min="40" max="250" step="5" value="${leg.lengthMeters || 120}" class="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg">
          </div>

          <div class="grid grid-cols-3 gap-1 pt-1">
            <button id="btn-flow-twoway-${idx}" class="py-1 text-[10px] font-semibold rounded border ${leg.flowMode === 'two-way' ? 'bg-sky-600/40 border-sky-500 text-sky-300' : 'bg-slate-900 border-slate-700 text-slate-400'}">Two-Way</button>
            <button id="btn-flow-inbound-${idx}" class="py-1 text-[10px] font-semibold rounded border ${leg.flowMode === 'inbound-only' ? 'bg-emerald-600/40 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}">Inbound</button>
            <button id="btn-flow-outbound-${idx}" class="py-1 text-[10px] font-semibold rounded border ${leg.flowMode === 'outbound-only' ? 'bg-amber-600/40 border-amber-500 text-amber-300' : 'bg-slate-900 border-slate-700 text-slate-400'}">Outbound</button>
          </div>

          <div class="space-y-1 bg-slate-900/40 p-2 rounded-lg border border-slate-700/40">
            <div class="flex justify-between text-[10px]">
              <span class="text-amber-400 font-semibold flex items-center gap-1">
                <i class="fa-solid fa-car-side text-[9px]"></i> Inflow Demand Level
              </span>
              <span id="val-leg-demand-${idx}" class="font-mono font-bold text-amber-300">${(spawnWeightVal * 100).toFixed(0)}%</span>
            </div>
            <input id="slider-leg-demand-${idx}" type="range" min="0.1" max="3.0" step="0.1" value="${spawnWeightVal}" class="w-full accent-amber-500 bg-slate-700 h-1.5 rounded-lg">
          </div>
        `;

        container.appendChild(legCard);

        document.getElementById(`slider-leg-demand-${idx}`).addEventListener('input', (e) => {
          leg.spawnWeight = parseFloat(e.target.value);
          document.getElementById(`val-leg-demand-${idx}`).textContent = `${(leg.spawnWeight * 100).toFixed(0)}%`;
        });

        document.getElementById(`select-leg-exit-${idx}`).addEventListener('change', (e) => {
          leg.exitPreference = e.target.value;
        });

        document.getElementById(`slider-leg-angle-${idx}`).addEventListener('input', (e) => {
          leg.angleOffset = parseInt(e.target.value, 10);
          document.getElementById(`val-leg-angle-${idx}`).textContent = `${leg.angleOffset}°`;
          requestAnimationFrame(render);
        });

        document.getElementById(`slider-leg-width-${idx}`).addEventListener('input', (e) => {
          leg.widthMeters = parseInt(e.target.value, 10);
          document.getElementById(`val-leg-width-${idx}`).textContent = `${leg.widthMeters} m`;
          requestAnimationFrame(render);
        });

        document.getElementById(`slider-leg-length-${idx}`).addEventListener('input', (e) => {
          leg.lengthMeters = parseInt(e.target.value, 10);
          document.getElementById(`val-leg-length-${idx}`).textContent = `${leg.lengthMeters} m`;
          requestAnimationFrame(render);
        });

        document.getElementById(`btn-flow-twoway-${idx}`).addEventListener('click', () => {
          leg.flowMode = 'two-way';
          clearVehiclesForLeg(leg.id);
          renderPerLegUIControls();
          requestAnimationFrame(render);
        });
        document.getElementById(`btn-flow-inbound-${idx}`).addEventListener('click', () => {
          leg.flowMode = 'inbound-only';
          clearVehiclesForLeg(leg.id);
          renderPerLegUIControls();
          requestAnimationFrame(render);
        });
        document.getElementById(`btn-flow-outbound-${idx}`).addEventListener('click', () => {
          leg.flowMode = 'outbound-only';
          clearVehiclesForLeg(leg.id);
          renderPerLegUIControls();
          requestAnimationFrame(render);
        });
      });
    }

    function clearVehiclesForLeg(legId) {
      vehicleAgents = vehicleAgents.filter(car => car.entryLegId !== legId && car.exitLegId !== legId);
    }

    function render() {
      if (!ctx || !canvas || !map) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerLatLng = L.latLng(appState.centerLat, appState.centerLng);
      const centerPx = map.latLngToContainerPoint(centerLatLng);

      const outerPx = getPixelRadius(centerLatLng, appState.outerRadiusMeters);
      const islandPx = getPixelRadius(centerLatLng, appState.islandRadiusMeters);

      // 1. Draw Approach Road Legs
      legTipPoints = [];
      widthHandlePoints = [];
      rotateHandlePoint = null;
      appState.legs.forEach((leg, legIdx) => {
        const totalAngleDeg = (leg.baseAngle + leg.angleOffset + appState.globalAngleOffset) % 360;
        const rad = (totalAngleDeg * Math.PI) / 180;

        const legWidthPx = getPixelRadius(centerLatLng, leg.widthMeters);
        const legLengthPx = getPixelRadius(centerLatLng, leg.lengthMeters || 120);

        legTipPoints.push({
          idx: legIdx,
          x: centerPx.x + Math.sin(rad) * legLengthPx,
          y: centerPx.y - Math.cos(rad) * legLengthPx
        });

        widthHandlePoints.push({
          idx: legIdx,
          x: centerPx.x + (legWidthPx / 2) * Math.cos(rad) + (legLengthPx / 2) * Math.sin(rad),
          y: centerPx.y + (legWidthPx / 2) * Math.sin(rad) - (legLengthPx / 2) * Math.cos(rad)
        });
        widthHandlePoints.push({
          idx: legIdx,
          x: centerPx.x - (legWidthPx / 2) * Math.cos(rad) + (legLengthPx / 2) * Math.sin(rad),
          y: centerPx.y - (legWidthPx / 2) * Math.sin(rad) - (legLengthPx / 2) * Math.cos(rad)
        });

        ctx.save();
        ctx.translate(centerPx.x, centerPx.y);
        ctx.rotate(rad);

        // Asphalt Road
        ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
        ctx.fillRect(-legWidthPx / 2, -legLengthPx, legWidthPx, legLengthPx);

        // Curb Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-legWidthPx / 2, -legLengthPx);
        ctx.lineTo(-legWidthPx / 2, -outerPx);
        ctx.moveTo(legWidthPx / 2, -legLengthPx);
        ctx.lineTo(legWidthPx / 2, -outerPx);
        ctx.moveTo(-legWidthPx / 2, -legLengthPx);
        ctx.lineTo(legWidthPx / 2, -legLengthPx);
        ctx.stroke();

        // Center Dividing Markings
        ctx.beginPath();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = leg.flowMode === 'two-way' ? '#f59e0b' : '#94a3b8';
        ctx.moveTo(0, -legLengthPx);
        ctx.lineTo(0, -outerPx - 15);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zebra Crosswalks
        if (appState.showCrosswalks) {
          const cwDistance = outerPx + 35;
          const cwWidth = legWidthPx - 4;
          const stripeWidth = 5;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          for (let x = -cwWidth / 2 + 2; x < cwWidth / 2 - 2; x += stripeWidth * 2) {
            ctx.fillRect(x, -cwDistance, stripeWidth, 16);
          }
        }

        // Yield Triangles
        if (appState.showYieldLines && leg.flowMode !== 'outbound-only') {
          const yieldY = -outerPx - 5;
          const entryOffset = appState.trafficStandard === 'RHT' ? -legWidthPx / 4 : legWidthPx / 4;
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.moveTo(entryOffset - 6, yieldY - 12);
          ctx.lineTo(entryOffset + 6, yieldY - 12);
          ctx.lineTo(entryOffset, yieldY);
          ctx.closePath();
          ctx.fill();
        }

        // Length Drag Handle (only when rotunda is selected)
        if (rotundaSelected) {
          ctx.beginPath();
          ctx.arc(0, -legLengthPx, draggingLegIdx === legIdx ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = draggingLegIdx === legIdx ? '#38bdf8' : 'rgba(56, 189, 248, 0.85)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();

          // Width Drag Handles (only when rotunda is selected)
          const widthHandleY = -legLengthPx / 2;
          [-legWidthPx / 2, legWidthPx / 2].forEach((hx) => {
            ctx.beginPath();
            ctx.arc(hx, widthHandleY, draggingWidthLegIdx === legIdx ? 8 : 6, 0, Math.PI * 2);
            ctx.fillStyle = draggingWidthLegIdx === legIdx ? '#e879f9' : 'rgba(232, 121, 249, 0.85)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
          });
        }

        ctx.restore();
      });

      // 2. Main Roundabout Ring
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, outerPx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Inner Circulating Lane Dividers
      if (appState.ringLanes > 1) {
        const ringStep = (outerPx - islandPx) / appState.ringLanes;
        for (let l = 1; l < appState.ringLanes; l++) {
          ctx.beginPath();
          ctx.arc(centerPx.x, centerPx.y, islandPx + ringStep * l, 0, Math.PI * 2);
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 3. Central Island Circle
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, islandPx, 0, Math.PI * 2);
      ctx.fillStyle = '#059669';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#10b981';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, Math.max(islandPx - 6, 2), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 78, 59, 0.6)';
      ctx.fill();

      // Rotation Drag Handle (only when rotunda is selected)
      if (rotundaSelected) {
        const rotateRad = (appState.globalAngleOffset * Math.PI) / 180;
        const handleDist = outerPx + 18;
        rotateHandlePoint = {
          x: centerPx.x + Math.sin(rotateRad) * handleDist,
          y: centerPx.y - Math.cos(rotateRad) * handleDist
        };

        ctx.beginPath();
        ctx.moveTo(centerPx.x + Math.sin(rotateRad) * outerPx, centerPx.y - Math.cos(rotateRad) * outerPx);
        ctx.lineTo(rotateHandlePoint.x, rotateHandlePoint.y);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rotateHandlePoint.x, rotateHandlePoint.y, draggingRotation ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = draggingRotation ? '#fbbf24' : 'rgba(251, 191, 36, 0.85)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }

      // Crosshair Center
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerPx.x - 10, centerPx.y);
      ctx.lineTo(centerPx.x + 10, centerPx.y);
      ctx.moveTo(centerPx.x, centerPx.y - 10);
      ctx.lineTo(centerPx.x, centerPx.y + 10);
      ctx.stroke();

      // 4. Trajectory Guide Lines
      if (appState.guideLines) {
        ctx.beginPath();
        ctx.arc(centerPx.x, centerPx.y, (outerPx + islandPx) / 2, 0, Math.PI * 2);
        ctx.strokeStyle = appState.trafficStandard === 'RHT' ? 'rgba(14, 165, 233, 0.35)' : 'rgba(236, 72, 153, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 5. Draw Active Microscopic Vehicles
      drawVehicleAgents(centerPx, outerPx, islandPx);
    }

    function spawnVehicle() {
      if (appState.legs.length === 0) return;

      const validEntryLegs = appState.legs.filter(l => l.flowMode !== 'outbound-only');
      const validExitLegs = appState.legs.filter(l => l.flowMode !== 'inbound-only');

      if (validEntryLegs.length === 0 || validExitLegs.length === 0) return;

      const totalInflowWeight = validEntryLegs.reduce((sum, leg) => sum + (leg.spawnWeight || 1.0), 0);
      let rndInflow = Math.random() * totalInflowWeight;
      let entryLeg = validEntryLegs[0];

      for (let leg of validEntryLegs) {
        const weight = leg.spawnWeight || 1.0;
        if (rndInflow <= weight) {
          entryLeg = leg;
          break;
        }
        rndInflow -= weight;
      }

      let availableExitLegs = validExitLegs.filter(l => validExitLegs.length === 1 || l.id !== entryLeg.id);
      if (availableExitLegs.length === 0) availableExitLegs = validExitLegs;

      let exitLeg = availableExitLegs[0];
      const pref = entryLeg.exitPreference || 'balanced';

      if (pref === 'balanced' || availableExitLegs.length <= 1) {
        exitLeg = availableExitLegs[Math.floor(Math.random() * availableExitLegs.length)];
      } else {
        const entryAngle = (entryLeg.baseAngle + entryLeg.angleOffset + appState.globalAngleOffset + 360) % 360;

        const weightedExits = availableExitLegs.map(l => {
          const exitAngle = (l.baseAngle + l.angleOffset + appState.globalAngleOffset + 360) % 360;
          let diff = (exitAngle - entryAngle + 360) % 360;
          let weight = 1.0;

          if (pref === 'opposite') {
            const oppositeDiff = Math.abs(diff - 180);
            weight = Math.max(0.2, 5.0 - (oppositeDiff / 30));
          } else if (pref === 'turn-right') {
            const targetDiff = appState.trafficStandard === 'RHT' ? 90 : 270;
            const rightDiff = Math.abs(diff - targetDiff);
            weight = Math.max(0.2, 5.0 - (rightDiff / 30));
          } else if (pref === 'turn-left') {
            const targetDiff = appState.trafficStandard === 'RHT' ? 270 : 90;
            const leftDiff = Math.abs(diff - targetDiff);
            weight = Math.max(0.2, 5.0 - (leftDiff / 30));
          }
          return { leg: l, weight: Math.max(0.1, weight) };
        });

        const totalExitWeight = weightedExits.reduce((sum, item) => sum + item.weight, 0);
        let rndExit = Math.random() * totalExitWeight;

        for (let item of weightedExits) {
          if (rndExit <= item.weight) {
            exitLeg = item.leg;
            break;
          }
          rndExit -= item.weight;
        }
      }

      const sortedLegs = [...appState.legs].sort((a, b) => {
        const aAngle = (a.baseAngle + a.angleOffset) % 360;
        const bAngle = (b.baseAngle + b.angleOffset) % 360;
        return aAngle - bAngle;
      });

      const entryIdx = sortedLegs.findIndex(l => l.id === entryLeg.id);
      const exitIdx = sortedLegs.findIndex(l => l.id === exitLeg.id);

      let stepCount = 0;
      if (appState.trafficStandard === 'RHT') {
        stepCount = (exitIdx - entryIdx + sortedLegs.length) % sortedLegs.length;
      } else {
        stepCount = (entryIdx - exitIdx + sortedLegs.length) % sortedLegs.length;
      }
      if (stepCount === 0) stepCount = sortedLegs.length;

      let targetLaneFraction = 0.8;
      if (appState.ringLanes > 1) {
        if (stepCount === 1) {
          targetLaneFraction = 0.82;
        } else if (stepCount === 2) {
          targetLaneFraction = appState.ringLanes === 3 ? 0.52 : 0.72;
        } else {
          targetLaneFraction = 0.22;
        }
      }

      const vehicleColor = ['#38bdf8', '#34d399', '#f87171', '#fbbf24', '#a78bfa'][Math.floor(Math.random() * 5)];
      const baseSpeed = (appState.maxSpeedKmH / 3600) * 0.08;

      vehicleAgents.push({
        id: Math.random(),
        entryLegId: entryLeg.id,
        exitLegId: exitLeg.id,
        progress: 0,
        speed: baseSpeed,
        currentSpeed: baseSpeed,
        color: vehicleColor,
        laneFraction: targetLaneFraction,
        stepCount: stepCount,
        isYielding: false
      });
    }

    function getVehiclePosition(car, progress, centerPx, outerPx, islandPx, centerLatLng) {
      const entryLeg = appState.legs.find(l => l.id === car.entryLegId) || appState.legs[0];
      const exitLeg = appState.legs.find(l => l.id === car.exitLegId) || appState.legs[0];

      const entryAngleDeg = (entryLeg.baseAngle + entryLeg.angleOffset + appState.globalAngleOffset) % 360;
      const exitAngleDeg = (exitLeg.baseAngle + exitLeg.angleOffset + appState.globalAngleOffset) % 360;

      const outerLaneRadius = islandPx + (outerPx - islandPx) * 0.78;
      const targetRadius = islandPx + (outerPx - islandPx) * car.laneFraction;

      let posX = centerPx.x;
      let posY = centerPx.y;

      if (progress < 1) {
        const entryLenPx = getPixelRadius(centerLatLng, entryLeg.lengthMeters || 120);
        const dist = entryLenPx * (1 - progress) + outerPx;
        const rad = (entryAngleDeg * Math.PI) / 180;
        const entryOffsetMeters = appState.trafficStandard === 'RHT' ? -(entryLeg.widthMeters / 4) : (entryLeg.widthMeters / 4);
        const localXPx = getPixelRadius(centerLatLng, entryOffsetMeters) * Math.sign(entryOffsetMeters);

        let effLocalX = localXPx;
        if (progress > 0.7) {
          const curveBlend = (progress - 0.7) / 0.3;
          effLocalX = localXPx * (1 - curveBlend) + (appState.trafficStandard === 'RHT' ? -targetRadius * 0.2 : targetRadius * 0.2) * curveBlend;
        }

        const localYPx = -dist;
        posX = centerPx.x + effLocalX * Math.cos(rad) - localYPx * Math.sin(rad);
        posY = centerPx.y + effLocalX * Math.sin(rad) + localYPx * Math.cos(rad);

      } else if (progress >= 1 && progress < 2) {
        const ringProgress = progress - 1;
        let startAngle = (entryAngleDeg - 90) * (Math.PI / 180);
        let endAngle = (exitAngleDeg - 90) * (Math.PI / 180);

        if (appState.trafficStandard === 'RHT') {
          if (endAngle <= startAngle) endAngle += Math.PI * 2;
        } else {
          if (endAngle >= startAngle) endAngle -= Math.PI * 2;
        }

        const currentArcAngle = startAngle + (endAngle - startAngle) * ringProgress;

        let currentRadius = targetRadius;
        if (ringProgress < 0.3) {
          const t = ringProgress / 0.3;
          const easeT = t * t * (3 - 2 * t);
          currentRadius = outerLaneRadius * (1 - easeT) + targetRadius * easeT;
        } else if (ringProgress > 0.7) {
          const t = (ringProgress - 0.7) / 0.3;
          const easeT = t * t * (3 - 2 * t);
          currentRadius = targetRadius * (1 - easeT) + outerLaneRadius * easeT;
        }

        posX = centerPx.x + Math.cos(currentArcAngle) * currentRadius;
        posY = centerPx.y + Math.sin(currentArcAngle) * currentRadius;

      } else {
        const exitProgress = progress - 2;
        const exitLenPx = getPixelRadius(centerLatLng, exitLeg.lengthMeters || 120);
        const dist = outerPx + exitLenPx * exitProgress;
        const rad = (exitAngleDeg * Math.PI) / 180;
        const exitOffsetMeters = appState.trafficStandard === 'RHT' ? (exitLeg.widthMeters / 4) : -(exitLeg.widthMeters / 4);
        const localXPx = getPixelRadius(centerLatLng, exitOffsetMeters) * Math.sign(exitOffsetMeters);

        let effLocalX = localXPx;
        if (exitProgress < 0.2) {
          const curveBlend = exitProgress / 0.2;
          effLocalX = (appState.trafficStandard === 'RHT' ? outerLaneRadius * 0.2 : -outerLaneRadius * 0.2) * (1 - curveBlend) + localXPx * curveBlend;
        }

        const localYPx = -dist;
        posX = centerPx.x + effLocalX * Math.cos(rad) - localYPx * Math.sin(rad);
        posY = centerPx.y + effLocalX * Math.sin(rad) + localYPx * Math.cos(rad);
      }

      return { x: posX, y: posY };
    }

    function updateSimulation(dt) {
      if (!appState.simulationRunning) return;

      const centerLatLng = L.latLng(appState.centerLat, appState.centerLng);
      const centerPx = map.latLngToContainerPoint(centerLatLng);
      const outerPx = getPixelRadius(centerLatLng, appState.outerRadiusMeters);
      const islandPx = getPixelRadius(centerLatLng, appState.islandRadiusMeters);

      const spawnInterval = (60 / appState.spawnRatePerMin);
      if (Math.random() < (dt / spawnInterval)) {
        spawnVehicle();
      }

      const ringCars = vehicleAgents.filter(c => c.progress >= 1.0 && c.progress < 2.0);
      const ringOccupancy = ringCars.length;

      const avgRadiusMeters = (appState.outerRadiusMeters + appState.islandRadiusMeters) / 2;
      const circumferenceMeters = 2 * Math.PI * avgRadiusMeters;
      const maxRingCapacity = Math.max(6, Math.floor((circumferenceMeters / 7.5) * appState.ringLanes));

      const carData = vehicleAgents.map(car => {
        const pos = getVehiclePosition(car, car.progress, centerPx, outerPx, islandPx, centerLatLng);
        const aheadPos = getVehiclePosition(car, car.progress + 0.005, centerPx, outerPx, islandPx, centerLatLng);
        const dx = aheadPos.x - pos.x;
        const dy = aheadPos.y - pos.y;
        const len = Math.hypot(dx, dy) || 1;
        return {
          car,
          pos,
          dir: { x: dx / len, y: dy / len }
        };
      });

      let yieldingCount = 0;

      for (let i = 0; i < carData.length; i++) {
        const item = carData[i];
        const car = item.car;
        const pos = item.pos;
        const dir = item.dir;

        let targetSpeed = car.speed;
        let mustStopForYield = false;

        if (car.progress >= 0.90 && car.progress < 1.0) {
          if (ringOccupancy >= maxRingCapacity) {
            mustStopForYield = true;
          }

          if (!mustStopForYield) {
            const yieldThresholdPx = Math.max(25, outerPx * 0.45);
            for (let rCar of ringCars) {
              const rPos = getVehiclePosition(rCar, rCar.progress, centerPx, outerPx, islandPx, centerLatLng);
              const distToEntry = Math.hypot(rPos.x - pos.x, rPos.y - pos.y);

              if (distToEntry < yieldThresholdPx) {
                mustStopForYield = true;
                break;
              }
            }
          }

          if (mustStopForYield) {
            targetSpeed = 0;
            car.isYielding = true;
            yieldingCount++;
          } else {
            car.isYielding = false;
          }
        } else {
          car.isYielding = false;
        }

        const MIN_SAFE_GAP = 24;

        for (let j = 0; j < carData.length; j++) {
          if (i === j) continue;
          const other = carData[j];

          const relX = other.pos.x - pos.x;
          const relY = other.pos.y - pos.y;
          const dist = Math.hypot(relX, relY);
          const dot = relX * dir.x + relY * dir.y;

          if (dist < MIN_SAFE_GAP && dot > 0) {
            const gapFactor = Math.max(0, (dist - 10) / (MIN_SAFE_GAP - 10));
            targetSpeed = Math.min(targetSpeed, car.speed * gapFactor);
            if (dist < 14) targetSpeed = 0;
          }
        }

        if (targetSpeed < car.currentSpeed) {
          car.currentSpeed += (targetSpeed - car.currentSpeed) * Math.min(1, dt * 14);
        } else {
          car.currentSpeed += (targetSpeed - car.currentSpeed) * Math.min(1, dt * 6);
        }

        if (mustStopForYield && car.progress >= 0.95 && car.progress < 1.0) {
          car.progress = 0.95;
          car.currentSpeed = 0;
        } else {
          car.progress += car.currentSpeed * dt * 60;
        }
      }

      for (let i = vehicleAgents.length - 1; i >= 0; i--) {
        if (vehicleAgents[i].progress >= 3.0) {
          vehicleAgents.splice(i, 1);
          simStats.totalProcessed++;
        }
      }

      simStats.activeCarsCount = vehicleAgents.length;
      updateHUD(yieldingCount);
    }

    function drawVehicleAgents(centerPx, outerPx, islandPx) {
      const centerLatLng = L.latLng(appState.centerLat, appState.centerLng);

      vehicleAgents.forEach((car) => {
        const pos = getVehiclePosition(car, car.progress, centerPx, outerPx, islandPx, centerLatLng);
        const aheadPos = getVehiclePosition(car, car.progress + 0.005, centerPx, outerPx, islandPx, centerLatLng);

        const dx = aheadPos.x - pos.x;
        const dy = aheadPos.y - pos.y;
        const headingRad = Math.atan2(dy, dx) + Math.PI / 2;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(headingRad);

        ctx.fillStyle = car.color;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillRect(-5, -9, 10, 18);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -6, 8, 4);

        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-4, -9, 2, 1);
        ctx.fillRect(2, -9, 2, 1);

        if (car.currentSpeed < car.speed * 0.3 || car.isYielding) {
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 6;
          ctx.fillRect(-4, 8, 2.5, 1.5);
          ctx.fillRect(1.5, 8, 2.5, 1.5);
        }

        ctx.restore();
      });
    }

    function updateHUD(yieldingCount = 0) {
      const throughputEl = document.getElementById('hud-throughput');
      const delayEl = document.getElementById('hud-delay');
      const activeCarsEl = document.getElementById('hud-active-cars');
      const activePedsEl = document.getElementById('hud-active-peds');
      const capPercentEl = document.getElementById('hud-capacity-percent');
      const capBarEl = document.getElementById('hud-capacity-bar');

      if (throughputEl) throughputEl.textContent = simStats.totalProcessed;
      if (activeCarsEl) activeCarsEl.textContent = simStats.activeCarsCount;
      
      const pedCount = Math.floor(simStats.activeCarsCount * 0.15);
      if (activePedsEl) activePedsEl.textContent = pedCount;

      const avgDelay = ((simStats.activeCarsCount * 0.12) + (yieldingCount * 1.2)).toFixed(1);
      if (delayEl) delayEl.textContent = `${avgDelay} s`;

      const avgRadiusMeters = (appState.outerRadiusMeters + appState.islandRadiusMeters) / 2;
      const circumferenceMeters = 2 * Math.PI * avgRadiusMeters;
      const maxRingCapacity = Math.max(6, Math.floor((circumferenceMeters / 7.5) * appState.ringLanes));

      const ringCars = vehicleAgents.filter(c => c.progress >= 1.0 && c.progress < 2.0);
      const ringOccupancy = ringCars.length;

      const capacityRatio = Math.min(100, Math.round((ringOccupancy / maxRingCapacity) * 100));
      if (capPercentEl) capPercentEl.textContent = `${capacityRatio}% (${ringOccupancy}/${maxRingCapacity} Ring Cars)`;
      if (capBarEl) {
        capBarEl.style.width = `${capacityRatio}%`;
        if (capacityRatio > 85) {
          capBarEl.className = "bg-rose-500 h-full transition-all duration-300";
        } else if (capacityRatio > 60) {
          capBarEl.className = "bg-amber-500 h-full transition-all duration-300";
        } else {
          capBarEl.className = "bg-sky-500 h-full transition-all duration-300";
        }
      }
    }

    function animate(now) {
      const dt = Math.min((now - lastAnimTime) / 1000, 0.1);
      lastAnimTime = now;

      if (appState.simulationRunning) {
        updateSimulation(dt);
      }
      render();
      refreshSaveButtonState();
      requestAnimationFrame(animate);
    }

    window.addEventListener('load', () => {
      safeLoadLocalStorage();
      loadSavedRotundas();

      const lastRotunda = [...savedRotundas].sort((a, b) => b.timestamp - a.timestamp)[0];
      if (lastRotunda && lastRotunda.state) {
        assignStateFields(lastRotunda.state);
        currentRotundaId = lastRotunda.id;
      } else {
        initLegsState();
      }

      initMap();
      initCanvas();
      bindUIControls();
      renderPerLegUIControls();
      renderSavedRotundas();
      markSnapshotAsSaved();
      refreshSaveButtonState();

      lastAnimTime = performance.now();
      requestAnimationFrame(animate);
    });
