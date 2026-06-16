const deploymentLogsPath = "../applications";
const deploymentLogsIndexUrl = `${deploymentLogsPath}/index.json`;
let deployments = [];
let versionOptionsPerApp = {};   // Cache for upgrade options

function parseCSV(text) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0]
        .split(",")
        .map(h => h.replace(/"/g, "").trim());
    return lines.slice(1).map(line => {
        const values = line
            .split(",")
            .map(v => v.replace(/"/g, "").trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || "";
        });
        return row;
    });
}

async function loadData() {
    try {
        const indexResponse = await fetch(deploymentLogsIndexUrl);
        if (!indexResponse.ok) throw new Error(`Unable to load ${deploymentLogsIndexUrl}`);

        const files = (await indexResponse.json())
            .filter(f => typeof f === "string" && f.toLowerCase().endsWith(".csv"));

        deployments = [];
        for (const file of files) {
            const res = await fetch(`${deploymentLogsPath}/${file}`);
            if (!res.ok) continue;
            const text = await res.text();
            deployments.push(...parseCSV(text));
        }

        buildVersionOptions();
        loadFilters();
        renderTable();
    } catch (error) {
        console.error(error);
        document.getElementById("tableContainer").innerHTML = 
            `<div class="text-red-500 text-center py-12">Failed to load deployment data</div>`;
    }
}

function buildVersionOptions() {
    versionOptionsPerApp = {};
    const appVersions = {};
    deployments.forEach(row => {
        if (!appVersions[row.Application]) appVersions[row.Application] = new Set();
        appVersions[row.Application].add(row.Version);
    });
    Object.keys(appVersions).forEach(app => {
        versionOptionsPerApp[app] = Array.from(appVersions[app]).sort(compareVersions);
    });
}

function compareVersions(a, b) {
    const aa = a.split('.').map(Number);
    const bb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
        const diff = (aa[i] || 0) - (bb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

function getUpgradableVersions(app, currentVersion, isProd) {
    const all = versionOptionsPerApp[app] || [];
    let candidates = all.filter(v => compareVersions(v, currentVersion) > 0);
    if (isProd) {
        const uatVersions = new Set(
            deployments
                .filter(r => r.Application === app && r.Environment === 'UAT')
                .map(r => r.Version)
        );
        candidates = candidates.filter(v => uatVersions.has(v));
    }
    return candidates;
}

function loadFilters() {
    fillSelect("clientFilter", [...new Set(deployments.map(x => x.Client))]);
    fillSelect("applicationFilter", [...new Set(deployments.map(x => x.Application))]);
    fillSelect("versionFilter", [...new Set(deployments.map(x => x.Version))]);
    fillSelect("environmentFilter", [...new Set(deployments.map(x => x.Environment))]);
}

function fillSelect(id, values) {
    const select = document.getElementById(id);
    select.innerHTML = `<option value="">All ${id.replace('Filter','s')}</option>`;
    values
        .filter(Boolean)
        .sort()
        .forEach(value => {
            select.innerHTML += `<option value="${value}">${value}</option>`;
        });
}

function renderTable() {
    const search = document.getElementById("search").value.toLowerCase();
    const client = document.getElementById("clientFilter").value;
    const application = document.getElementById("applicationFilter").value;
    const version = document.getElementById("versionFilter").value;
    const environment = document.getElementById("environmentFilter").value;

    const rows = deployments.filter(row => {
        const matchSearch = !search ||
            (row.Client && row.Client.toLowerCase().includes(search)) ||
            (row.Application && row.Application.toLowerCase().includes(search)) ||
            (row.Version && row.Version.toLowerCase().includes(search)) ||
            (row.Environment && row.Environment.toLowerCase().includes(search));

        return matchSearch &&
            (!client || row.Client === client) &&
            (!application || row.Application === application) &&
            (!version || row.Version === version) &&
            (!environment || row.Environment === environment);
    });

    document.getElementById("tableContainer").innerHTML = `
        <table class="w-full">
            <thead>
                <tr class="bg-slate-900 border-b border-slate-700">
                    <th class="p-4 text-left font-medium text-slate-300">Client</th>
                    <th class="p-4 text-left font-medium text-slate-300">Application</th>
                    <th class="p-4 text-left font-medium text-slate-300">Version</th>
                    <th class="p-4 text-left font-medium text-slate-300">Environment</th>
                    <th class="p-4 text-left font-medium text-slate-300">Status</th>
                    <th class="p-4 text-left font-medium text-slate-300">Deployment Time</th>
                    <th class="p-4 text-left font-medium text-slate-300">Triggered By</th>
                    <th class="p-4 text-left font-medium text-slate-300">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
                ${rows.map(row => {
                    const isProd = row.Environment === 'PROD';
                    return `
                    <tr class="hover:bg-slate-800/70 transition-colors">
                        <td class="p-4">${row.Client || "-"}</td>
                        <td class="p-4">${row.Application || "-"}</td>
                        <td class="p-4 font-mono" id="version-cell-${row.Client}-${row.Application}">${row.Version || "-"}</td>
                        <td class="p-4">
                            <span class="px-3 py-1 rounded-full text-xs font-medium ${
                                isProd ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400'
                            }">
                                ${row.Environment || "-"}
                            </span>
                        </td>
                        <td class="p-4">
                            <span class="${row.DeploymentStatus === "Succeeded" ? "text-emerald-500" : "text-red-500"} font-medium">
                                ${row.DeploymentStatus || "-"}
                            </span>
                        </td>
                        <td class="p-4 text-slate-400">${row.DeploymentDateTime || "-"}</td>
                        <td class="p-4 text-slate-400">${row.TriggeredBy || "-"}</td>
                        <td class="p-4">
                            <div class="flex gap-2 flex-wrap">
                                <button onclick="handleRollback('${row.Client}', '${row.Application}', '${row.Version}', '${row.Environment}')" 
                                        class="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">↩ Rollback</button>
                                ${!isProd ? `
                                <button onclick="handlePromote('${row.Client}', '${row.Application}', '${row.Version}')" 
                                        class="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors">↑ Promote</button>` : ''}
                                <button onclick="handleUpgrade('${row.Client}', '${row.Application}', '${row.Version}', ${isProd})" 
                                        class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">⬆ Upgrade</button>
                            </div>
                        </td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>
        ${rows.length === 0 ? `<div class="text-center py-12 text-slate-400">No deployments found</div>` : ''}
    `;
}

// ==================== ACTION HANDLERS ====================

function handleRollback(client, app, version, env) {
    const url = `https://github.com/YOUR_ORG/YOUR_REPO/issues/new?template=rollback-config.yml&title=Rollback ${client}-${app} v${version}&body=Rollback Request%0A%0AClient: ${client}%0AApplication: ${app}%0AVersion: ${version}%0AEnvironment: ${env}%0AReason: [Add reason here]`;
    window.open(url, '_blank');
}

function handlePromote(client, app, version) {
    const url = `https://github.com/YOUR_ORG/YOUR_REPO/issues/new?template=promote-to-prod.yml&title=Promote to PROD - ${client}-${app} v${version}&body=Promotion Request%0A%0AClient: ${client}%0AApplication: ${app}%0AVersion: ${version}%0AFrom: UAT%0ATo: PROD`;
    window.open(url, '_blank');
}

function handleUpgrade(client, app, currentVersion, isProd) {
    const cell = document.getElementById(`version-cell-${client}-${app}`);
    if (!cell) return;

    const options = getUpgradableVersions(app, currentVersion, isProd);
    if (options.length === 0) {
        alert("No higher versions available.");
        return;
    }

    let html = `<select onchange="confirmUpgrade(this, '${client}', '${app}', '${currentVersion}')" class="bg-slate-800 border border-blue-500 text-white px-3 py-1 rounded text-sm">`;
    html += `<option value="">Select version...</option>`;
    options.forEach(v => html += `<option value="${v}">${v}</option>`);
    html += `</select>`;

    cell.innerHTML = html;
}

function confirmUpgrade(select, client, app, oldVersion) {
    const newVersion = select.value;
    if (!newVersion) return;

    const url = `https://github.com/YOUR_ORG/YOUR_REPO/issues/new?template=upgrade-version.yml&title=Upgrade ${client}-${app} from v${oldVersion} to v${newVersion}&body=Upgrade Request%0A%0AClient: ${client}%0AApplication: ${app}%0ACurrent Version: ${oldVersion}%0ATarget Version: ${newVersion}`;
    window.open(url, '_blank');

    // Reset cell after action
    setTimeout(() => {
        select.outerHTML = oldVersion;
    }, 500);
}

// Event Listeners
document.getElementById("search").addEventListener("input", renderTable);
document.getElementById("clientFilter").addEventListener("change", renderTable);
document.getElementById("applicationFilter").addEventListener("change", renderTable);
document.getElementById("versionFilter").addEventListener("change", renderTable);
document.getElementById("environmentFilter").addEventListener("change", renderTable);

// Initial load
loadData();