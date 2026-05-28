const modal_Main = {
  init: null,
  api: "https://demoosv.onrender.com",
  hospitals: [],
  code_BV: [{ code: "77094", name: "BV Mat Ba Ria" }],

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

  getHospitalName: function (code) {
    const found = modal_Main.code_BV.find((x) => x.code === code);
    return found ? found.name : code;
  },

  getdata: async function () {
    const data = await modal_Main.ApiResponse("/api/getdata");
    modal_Main.hospitals = data.data;
    console.log(modal_Main.hospitals);

    // Populate hospital filter dropdown
    const hospitals = [
      ...new Set(modal_Main.hospitals.map((b) => b.hospital_code)),
    ].sort();
    const select = document.getElementById("filterHospital");
    select.innerHTML = '<option value="all">Tất cả</option>';
    hospitals.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      select.appendChild(opt);
    });
  },

  // Helper: parse date string từ PostgreSQL → "YYYY-MM-DD"
  parseDate: function (dateStr) {
    if (!dateStr) return "";
    // PostgreSQL trả về dạng "2025-05-28T00:00:00.000Z" hoặc "2025-05-28 00:00:00"
    return dateStr.slice(0, 10);
  },

  // Helper: parse time string từ PostgreSQL → "HH:MM:SS"
  parseTime: function (dateStr) {
    if (!dateStr) return "";
    // Nếu có chữ T (ISO format)
    if (dateStr.includes("T")) {
      return dateStr.slice(11, 19);
    }
    // Nếu dạng "2025-05-28 17:30:00"
    return dateStr.slice(11, 19);
  },

  renderdata: function () {
    const filterHospital = document.getElementById("filterHospital").value;
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;

    let data = [...modal_Main.hospitals];

    // ── FILTER HOSPITAL
    if (filterHospital !== "all") {
      data = data.filter((b) => b.hospital_code === filterHospital);
    }

    // ── FILTER DATE (nếu người dùng chọn thủ công)
    if (from) {
      data = data.filter((b) => modal_Main.parseDate(b.backup_date) >= from);
    }

    if (to) {
      data = data.filter((b) => modal_Main.parseDate(b.backup_date) <= to);
    }

    // ── LẤY TẤT CẢ NGÀY CÓ TRONG DATA
    const allDates = [
      ...new Set(data.map((b) => modal_Main.parseDate(b.backup_date))),
    ].sort();

    // ── CHỈ HIỂN THỊ 3 NGÀY GẦN NHẤT (khi không filter ngày thủ công)
    let dates;
    if (!from && !to) {
      dates = allDates.slice(-3); // 3 ngày cuối
    } else {
      dates = allDates;
    }

    // ── STATS
    const totalSize = data.reduce(
      (sum, b) => sum + (Number(b.backup_size) || 0),
      0,
    );

    const hospitals = [...new Set(data.map((b) => b.hospital_code))];

    // Backup mới nhất — sort theo created_at nếu có, fallback backup_date
    const sorted = [...data].sort((a, b) => {
      const dateA = new Date(a.created_at || a.backup_date);
      const dateB = new Date(b.created_at || b.backup_date);
      return dateB - dateA;
    });

    const last = sorted[0];

    document.getElementById("sTotalBackups").textContent = data.length;
    document.getElementById("sTotalSize").textContent = totalSize.toFixed(2);
    document.getElementById("sProjects").textContent = hospitals.length;

    if (last) {
      const lastDate = modal_Main.parseDate(last.backup_date);
      const lastTime = modal_Main.parseTime(last.backup_date);

      document.getElementById("sLastDate").textContent = lastDate || "—";
      document.getElementById("sLastTime").textContent = lastTime || "—";
    }

    // ── PIVOT: host → date → record
    const pivot = {};

    // Pivot dựa trên toàn bộ data (không giới hạn 3 ngày) để tính trend/disk chính xác
    data.forEach((b) => {
      const hospital = b.hospital_code;
      const date = modal_Main.parseDate(b.backup_date);
      if (!pivot[hospital]) pivot[hospital] = {};
      if (!pivot[hospital][date]) pivot[hospital][date] = b;
    });

    // ── HEADER
    document.getElementById("thead").innerHTML = `
      <tr>
        <th>Hospital / Host</th>
        ${dates.map((d) => `<th class="center">${d.slice(5)}</th>`).join("")}
        <th class="center">Trend</th>
        <th class="center">Disk</th>
      </tr>
    `;

    // ── ROWS
    let html = "";
    const rows = hospitals.sort();

    rows.forEach((hospitalCode) => {
      html += `
        <tr>
          <td>
            <div class="hospital-name">${modal_Main.getHospitalName(hospitalCode)}</div>
          </td>
      `;

      const sizes = [];

      dates.forEach((date) => {
        const rec = pivot[hospitalCode]?.[date];

        if (!rec) {
          html += `<td class="center">—</td>`;
          sizes.push(null);
        } else if (
          rec.file_name === "NO_BACKUP" ||
          Number(rec.backup_size) === 0
        ) {
          html += `<td class="center"><span class="badge fail">FAIL</span></td>`;
          sizes.push(0);
        } else {
          html += `
            <td class="center">
              <span class="badge ok">${Number(rec.backup_size).toFixed(2)} GB</span>
            </td>
          `;
          sizes.push(Number(rec.backup_size));
        }
      });

      // TREND
      const valid = sizes.filter((s) => s !== null && s > 0);
      let trendHtml = "—";

      if (valid.length >= 2) {
        const change = valid[valid.length - 1] - valid[0];
        if (change > 0.01) {
          trendHtml = `<span class="trend-up">↑ +${change.toFixed(2)} GB</span>`;
        } else if (change < -0.01) {
          trendHtml = `<span class="trend-down">↓ ${change.toFixed(2)} GB</span>`;
        } else {
          trendHtml = `<span class="trend-flat">= ổn định</span>`;
        }
      }

      const allHospitalDates = Object.keys(pivot[hospitalCode] || {})
        .sort()
        .reverse();

      const lastRec = allHospitalDates
        .map((d) => pivot[hospitalCode][d])
        .find((r) => r && Number(r.disk_total) > 0);
      let diskHtml = "—";
      console.log(Number(lastRec.disk_total) - Number(lastRec.disk_free));
      if (lastRec) {
        const pct = (
          ((Number(lastRec.disk_total) - Number(lastRec.disk_free)) /
            Number(lastRec.disk_total)) *
          100
        ).toFixed(2);
        const color =
          pct >= 90
            ? "var(--red)"
            : pct >= 70
              ? "var(--yellow)"
              : "var(--green)";
        diskHtml = `
          <div class="disk-info">
            <div class="disk-bar-wrap">
              <div class="disk-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="disk-text" style="color:${color}">
              ${pct} %
            </span>
          </div>
        `;
      }

      html += `
        <td class="center">${trendHtml}</td>
        <td>${diskHtml}</td>
        </tr>
      `;
    });

    document.getElementById("tbody").innerHTML = html;

    // Filter note
    const note = document.getElementById("filterNote");
    if (!from && !to) {
      note.textContent = `Hiển thị 3 ngày gần nhất: ${dates.join(", ") || "—"}`;
    } else {
      note.textContent = `Lọc từ ${from || "—"} đến ${to || "—"} · ${dates.length} ngày`;
    }
  },

  init: function () {
    modal_Main.getdata().then(() => modal_Main.renderdata());
  },
};

// Gán hàm ra ngoài để HTML gọi được
function render() {
  modal_Main.renderdata();
}
function resetFilter() {
  document.getElementById("filterHospital").value = "all";
  document.getElementById("fromDate").value = "";
  document.getElementById("toDate").value = "";
  modal_Main.renderdata();
}
function doRefresh() {
  modal_Main.getdata().then(() => modal_Main.renderdata());
  document.getElementById("lastSync").textContent =
    "sync: " + new Date().toTimeString().slice(0, 8);
}

modal_Main.init();
