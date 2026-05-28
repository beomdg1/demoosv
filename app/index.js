const modal_Main = {
  init: null,
  api: "https://demoosv.onrender.com",
  hospitals: [],

  ApiResponse: async function (link, method = "GET", body = null) {
    try {
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${modal_Main.api}${link}`, options);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  getdata: async function () {
    const data = await modal_Main.ApiResponse("/api/getdata");
    modal_Main.hospitals = data.data;
    console.log(modal_Main.hospitals);
  },

  renderdata: function () {

    const hospital = document.getElementById("filterHospital").value;
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;

    let data = [...modal_Main.hospitals];

    // FILTER
    if (hospital !== "all") {
        data = data.filter((b) => b.host === hospital);
    }

    if (from) {
        data = data.filter((b) => b.backup_date.slice(0, 10) >= from);
    }

    if (to) {
        data = data.filter((b) => b.backup_date.slice(0, 10) <= to);
    }

    // STATS
    const totalSize = data.reduce(
        (sum, b) => sum + (Number(b.backup_size) || 0),
        0
    );

    const hosts = [...new Set(data.map((b) => b.host))];

    const sorted = [...data].sort(
        (a, b) => new Date(b.backup_date) - new Date(a.backup_date)
    );

    const last = sorted[0];

    document.getElementById("sTotalBackups").textContent = data.length;

    document.getElementById("sTotalSize").textContent =
        totalSize.toFixed(2);

    document.getElementById("sProjects").textContent =
        hosts.length;

    if (last) {

        document.getElementById("sLastDate").textContent =
            last.backup_date.slice(0, 10);

        document.getElementById("sLastTime").textContent =
            last.backup_date.slice(11, 19);
    }

    // DATES
    const dates = [
        ...new Set(data.map((b) => b.backup_date.slice(0, 10)))
    ].sort();

    const pivot = {};

    data.forEach((b) => {

        const host = b.host;
        const date = b.backup_date.slice(0, 10);

        if (!pivot[host]) {
            pivot[host] = {};
        }

        if (!pivot[host][date]) {
            pivot[host][date] = b;
        }

    });

    // HEADER
    document.getElementById("thead").innerHTML = `
        <tr>
            <th>Hospital / Host</th>

            ${dates.map((d) =>
                `<th class="center">${d.slice(5)}</th>`
            ).join("")}

            <th class="center">Trend</th>
            <th class="center">Disk</th>
        </tr>
    `;

    let html = "";

    const rows = hosts.sort();

    rows.forEach((host) => {

        html += `
            <tr>
                <td>
                    <div class="hospital-name">
                        ${host}
                    </div>
                </td>
        `;

        const sizes = [];

        dates.forEach((date) => {

            const rec = pivot[host]?.[date];

            if (!rec) {

                html += `
                    <td class="center">
                        —
                    </td>
                `;

                sizes.push(null);

            } else if (
                rec.file_name === "NO_BACKUP" ||
                Number(rec.backup_size) === 0
            ) {

                html += `
                    <td class="center">
                        <span class="badge fail">
                            FAIL
                        </span>
                    </td>
                `;

                sizes.push(0);

            } else {

                html += `
                    <td class="center">
                        <span class="badge ok">
                            ${Number(rec.backup_size).toFixed(2)} GB
                        </span>
                    </td>
                `;

                sizes.push(Number(rec.backup_size));
            }

        });

        // TREND
        const valid = sizes.filter(
            (s) => s !== null && s > 0
        );

        let trendHtml = "—";

        if (valid.length >= 2) {

            const change =
                valid[valid.length - 1] - valid[0];

            if (change > 0.01) {

                trendHtml = `
                    <span class="trend-up">
                        ↑ +${change.toFixed(2)} GB
                    </span>
                `;

            } else if (change < -0.01) {

                trendHtml = `
                    <span class="trend-down">
                        ↓ ${change.toFixed(2)} GB
                    </span>
                `;
            }
        }

        // DISK
        const lastRec = dates
            .slice()
            .reverse()
            .map((d) => pivot[host]?.[d])
            .find((r) => r && r.disk_total > 0);

        let diskHtml = "—";

        if (lastRec) {

            const pct = Number(lastRec.disk_percent);

            diskHtml = `
                ${Number(lastRec.disk_free).toFixed(0)} GB
                / ${Number(lastRec.disk_total).toFixed(0)} GB
                (${pct.toFixed(1)}%)
            `;
        }

        html += `
            <td class="center">
                ${trendHtml}
            </td>

            <td>
                ${diskHtml}
            </td>

        </tr>
        `;

    });

    document.getElementById("tbody").innerHTML = html;

},

  init: function () {
    modal_Main.getdata().then(() => modal_Main.renderdata());
  },
};


modal_Main.init();