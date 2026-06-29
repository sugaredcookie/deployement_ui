const deploymentLogsPath = "./applications";
const deploymentLogsCsvUrl = `${deploymentLogsPath}/DeploymentLogs.csv`;

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
        populateAppDropdown(); renderTable();
    } catch (e) { container.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-400 font-bold"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Failed to load data</td></tr>`; }
}

function parseCSV(text) {
    const lines = text.trim().split("\n");
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
        const key = `${row.Client}-${row.Application}-${row.Module || row.Application}`;
        if (!grouped[key]) {
            grouped[key] = { client: row.Client, app: row.Application, module: row.Module || row.Application, uat: "-", prod: "-", rowUat: null, rowProd: null };
        }
        if (row.Environment === "UAT") { grouped[key].uat = row.Version; grouped[key].rowUat = row; }
        if (row.Environment === "PROD") { grouped[key].prod = row.Version; grouped[key].rowProd = row; }
    });

    let htmlBuffer = '';
    Object.values(grouped).forEach(item => {
        const idUat = item.rowUat?.ReleaseId || "—", idProd = item.rowProd?.ReleaseId || "—";
        const dName = item.rowUat?.Module || item.rowProd?.Module || item.app;

        htmlBuffer += `
            <tr class="hover:bg-slate-800/30 bg-slate-900/20 transition group">
                <td class="p-4 pl-8 font-extrabold text-white tracking-wide truncate border-r border-slate-800/60">${item.client.replace(/_/g, ' ')}</td>
                <td class="p-4 font-sans font-bold text-slate-100 text-[13px] truncate border-r border-slate-800/60">${dName.replace(/_/g, ' ')}</td>
                <td class="p-4 text-center bg-slate-950/20 border-r border-slate-800/60">
                    <span class="font-mono text-xs font-bold ${item.uat !== '-' ? 'bg-slate-950 border border-blue-500/40 text-blue-400' : 'text-slate-600 bg-slate-900/40'} px-2.5 py-1 rounded shadow-sm inline-block min-w-[90px]">${item.uat}</span>
                    
                    <div class="mt-2.5 space-x-1 flex items-center justify-center">
                        ${item.uat !== '-' ? `
                            <button onclick="triggerPipelineAction('PROMOTION', '${item.client}', '${dName}', 'UAT', 'PROD', '${idUat}', '${item.uat}')" class="px-2.5 py-1 rounded bg-green-600/10 border border-green-500/30 text-green-400 hover:bg-green-600 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Promote</button>
                            <button onclick="triggerPipelineAction('ROLLBACK', '${item.client}', '${dName}', 'QA', 'UAT', '${idUat}', '${item.uat}')" class="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-amber-600 hover:text-white hover:border-amber-500 text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Rollback</button>
                        ` : ''}
                        <button onclick="openUpgradeWizard('${item.client}', '${dName}', '${item.uat}', 'UAT')" class="px-2.5 py-1 rounded bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Upgrade</button>
                    </div>
                </td>
                <td class="p-4 text-center bg-slate-950/10">
                    <span class="font-mono text-xs font-bold ${item.prod !== '-' ? 'bg-slate-950 border border-emerald-500/40 text-emerald-400' : 'text-slate-600 bg-slate-900/40 text-2xl'} px-2.5 py-1 rounded shadow-sm inline-block min-w-[90px]">${item.prod}</span>
                    
                    <div class="mt-2.5 space-x-1 flex items-center justify-center">
                        ${item.prod !== '-' ? `
                            <button onclick="triggerPipelineAction('ROLLBACK', '${item.client}', '${dName}', 'UAT', 'PROD', '${idProd}', '${item.prod}')" class="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-amber-600 hover:text-white hover:border-amber-500 text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm">Rollback</button>
                        ` : ''}
                        
                    </div>
                </td>
            </tr>`;
    });
    document.getElementById('matrix-body').innerHTML = htmlBuffer || `<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">No records match.</td></tr>`;
}

window.triggerPipelineAction = function() {
    window.open(`https://github.com/LD-Global-Services/Deployment/actions/workflows/module-deploy.yml?query=branch%3Amain+event%3Aworkflow_dispatch`, '_blank');
};

window.openUpgradeWizard = function(client, app, curVer, targetEnv) {
    upgradeContext = { client, app, currentVersion: curVer, targetEnv };
    document.getElementById('upgradeTargetSubtitle').textContent = `Module: ${app} | Active ${targetEnv} Version: ${curVer}`;
    
    const uatList = [...new Set(deployments.filter(d => (d.Module === app || d.Application === app) && d.Environment === "UAT" && d.Version && d.Version !== '-').map(d => d.Version))];
    const newerVers = uatList.filter(v => curVer === '-' || compareVersions(v, curVer) > 0).sort(compareVersions);

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
    const match = deployments.find(d => (d.Module === upgradeContext.app || d.Application === upgradeContext.app) && d.Version === targetVersion && d.Environment === "UAT");
    
    window.triggerPipelineAction('UPGRADE', upgradeContext.client, upgradeContext.app, 'UAT', upgradeContext.targetEnv, match ? match.ReleaseId : `RLS-UPG-${Date.now().toString().slice(-4)}`, targetVersion);
    window.closeUpgradeModal();
};

window.closeUpgradeModal = () => { document.getElementById('upgradeModal').classList.add('hidden'); upgradeContext = null; };
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeUpgradeModal(); });
window.onload = loadData;