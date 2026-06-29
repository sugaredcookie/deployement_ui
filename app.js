const deploymentLogsCsvUrl = "./applications/deploymentlogs.csv";

let deployments = [];
let upgradeContext = null;

const parseVersionToNumericArray = v => (!v || v === '—' || v === '-') ? [] : v.replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n || 0, 10));

function compareVersions(vA, vB) {
    const tA = parseVersionToNumericArray(vA), tB = parseVersionToNumericArray(vB);
    const max = Math.max(tA.length, tB.length);
    for (let i = 0; i < max; i++) {
        const nA = tA[i] || 0, nB = tB[i] || 0;
        if (nA !== nB) return nA - nB;
    }
    return 0;
}

async function loadData() {
    const container = document.getElementById('matrix-body');
    try {
        const res = await fetch(deploymentLogsCsvUrl);
        if (!res.ok) throw new Error();
        deployments = parseCSV(await res.text());
        populateAppDropdown(); 
        renderTable();
    } catch (e) { 
        container.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-400 font-bold"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Failed to parse live telemetry logs</td></tr>`; 
    }
}

function parseCSV(text) {
    const lines = text.trim().split("\n").filter(line => line.trim() !== "");
    if (lines.length === 0) return [];
    const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
    return lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.replace(/"/g, "").trim());
        const row = {}; headers.forEach((h, i) => row[h] = values[i] || "");
        return row;
    });
}

function populateAppDropdown() {
    const apps = [...new Set(deployments.map(d => d.Application).filter(Boolean))].sort();
    const select = document.getElementById('appFilter'); select.innerHTML = `<option value="">All Applications</option>`;
    apps.forEach(app => select.innerHTML += `<option value="${app}">${app}</option>`);
}

function renderTable() {
    const filterVal = document.getElementById('appFilter').value;
    const filtered = filterVal ? deployments.filter(d => d.Application === filterVal) : deployments;
    const grouped = {};

    filtered.forEach(row => {
        const key = `${row.Client}-${row.Application}`;
        if (!grouped[key]) {
            grouped[key] = { client: row.Client, app: row.Application, uat: "-", prod: "-" };
        }
        if (row.Environment === "UAT" && (grouped[key].uat === "-" || compareVersions(row.Version, grouped[key].uat) > 0)) {
            grouped[key].uat = row.Version;
        }
        if (row.Environment === "PROD" && (grouped[key].prod === "-" || compareVersions(row.Version, grouped[key].prod) > 0)) {
            grouped[key].prod = row.Version;
        }
    });

    let htmlBuffer = '';
    Object.values(grouped).forEach(item => {
        htmlBuffer += `
            <tr class="hover:bg-slate-800/30 bg-slate-900/20 transition group">
                <td class="p-4 pl-8 font-extrabold text-white tracking-wide truncate border-r border-slate-800/60">${item.client.replace(/_/g, ' ')}</td>
                <td class="p-4 font-sans font-bold text-slate-100 text-[13px] truncate border-r border-slate-800/60">${item.app.replace(/_/g, ' ')}</td>
                
                <td class="p-4 text-center bg-slate-950/20 border-r border-slate-800/60">
                    <span class="font-mono text-xs font-bold ${item.uat !== '-' ? 'bg-slate-950 border border-blue-500/40 text-blue-400' : 'text-slate-600 bg-slate-900/40'} px-2.5 py-1 rounded shadow-sm inline-block min-w-[90px]">${item.uat}</span>
                    <div class="mt-2.5 space-x-1 flex items-center justify-center">
                        ${item.uat !== '-' ? `
                            <button onclick="triggerPipelineAction('PROMOTION', '${item.client}', '${item.app}', 'UAT', 'PROD', '${item.uat}')" class="px-2 py-0.5 rounded bg-green-600/10 border border-green-500/30 text-green-400 hover:bg-green-600 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Promote</button>
                            <button onclick="triggerPipelineAction('ROLLBACK', '${item.client}', '${item.app}', 'QA', 'UAT', '${item.uat}')" class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-amber-600 hover:text-white hover:border-amber-500 text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Rollback</button>
                        ` : ''}
                        <button onclick="openUpgradeWizard('${item.client}', '${item.app}', '${item.uat}', 'UAT')" class="px-2 py-0.5 rounded bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Upgrade</button>
                    </div>
                </td>

                <td class="p-4 text-center bg-slate-950/10">
                    <span class="font-mono text-xs font-bold ${item.prod !== '-' ? 'bg-slate-950 border border-emerald-500/40 text-emerald-400' : 'text-slate-600 bg-slate-900/40'} px-2.5 py-1 rounded shadow-sm inline-block min-w-[90px]">${item.prod}</span>
                    <div class="mt-2.5 space-x-1 flex items-center justify-center">
                        ${item.prod !== '-' ? `
                            <button onclick="triggerPipelineAction('ROLLBACK', '${item.client}', '${item.app}', 'UAT', 'PROD', '${item.prod}')" class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-amber-600 hover:text-white hover:border-amber-500 text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Rollback</button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    });
    document.getElementById('matrix-body').innerHTML = htmlBuffer || `<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">No records match.</td></tr>`;
}

window.triggerPipelineAction = function(actionType, client, module, sourceEnv, targetEnv, version) {
    // REMOVED: const cleanClient = client.replace('CLIENT_', '');
    
    // Keep the original string (e.g., "CLIENT_A")
    const title = encodeURIComponent(`[${actionType}] ${module} deployment request for ${client}`);
    
    // Pass the exact value down to the issue body
    const body = encodeURIComponent(`### Run Parameters\n- **client**: ${client}\n- **module**: ${module}\n- **version**: ${version}\n- **stage**: ${targetEnv}\n- **action**: ${actionType}`);

    window.open(`https://github.com/sugaredcookie/deployement_ui/issues/new?title=${title}&body=${body}`, '_blank');
};

window.openUpgradeWizard = function(client, app, curVer, targetEnv) {
    upgradeContext = { client, app, currentVersion: curVer, targetEnv };
    document.getElementById('upgradeTargetSubtitle').textContent = `App: ${app} | Active ${targetEnv} Version: ${curVer}`;
    
    let matchedVersions = [];
    const label = document.getElementById('upgradeSelectLabel');

    if (targetEnv === "UAT") {
        label.textContent = "AVAILABLE NEWER QA APPROVED VERSIONS (ASCENDING)";
        matchedVersions = [...new Set(deployments.filter(d => d.Application === app && d.Environment === "QA" && d.Version).map(d => d.Version))];
    } else {
        label.textContent = "AVAILABLE NEWER UAT VERIFIED VERSIONS (ASCENDING)";
        matchedVersions = [...new Set(deployments.filter(d => d.Application === app && d.Environment === "UAT" && d.Version).map(d => d.Version))];
    }

    const newerVers = matchedVersions.filter(v => curVer === '-' || compareVersions(v, curVer) > 0).sort(compareVersions);
    const select = document.getElementById('upgradeVersionSelect'), confirmBtn = document.getElementById('upgradeConfirmBtn'), warningBox = document.getElementById('upgradeNoVersionsWarning');
    select.innerHTML = '';
    
    if (!newerVers.length) {
        select.classList.add('hidden'); confirmBtn.classList.add('hidden'); warningBox.classList.remove('hidden');
    } else {
        select.classList.remove('hidden'); confirmBtn.classList.remove('hidden'); warningBox.classList.add('hidden');
        newerVers.forEach(v => select.innerHTML += `<option value="${v}">Version ${v}</option>`);
    }
    document.getElementById('upgradeModal').classList.remove('hidden');
};

window.submitUpgradeAction = function() {
    if (!upgradeContext) return;
    const targetVersion = document.getElementById('upgradeVersionSelect').value;
    window.triggerPipelineAction('UPGRADE', upgradeContext.client, upgradeContext.app, upgradeContext.targetEnv === 'UAT' ? 'QA' : 'UAT', upgradeContext.targetEnv, targetVersion);
    window.closeUpgradeModal();
};

window.closeUpgradeModal = () => { document.getElementById('upgradeModal').classList.add('hidden'); upgradeContext = null; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeUpgradeModal(); });
window.onload = loadData;
