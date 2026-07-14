sap.ui.define([], function () {
  "use strict";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // Backend sends ISO date strings like "YYYY-MM-DD" for gstrp/pedtr (from ABAP DATE = ISO)
  function parseIsoDate(sIso) {
    if (!sIso || typeof sIso !== "string") {
      return null;
    }
    // Accept YYYY-MM-DD only
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sIso);
    if (!m) {
      return null;
    }
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function isYTD(dateObj, year) {
    if (!dateObj || !year) return false;
    var dYear = dateObj.getFullYear();
    if (dYear !== Number(year)) return false;
    return dateObj >= new Date(Number(year), 0, 1);
  }

  function isMTD(dateObj, year, month1to12) {
    if (!dateObj || !year || !month1to12) return false;
    var dYear = dateObj.getFullYear();
    if (dYear !== Number(year)) return false;
    var m = dateObj.getMonth() + 1;
    return m === Number(month1to12);
  }

  function getYearMonthFromIso(sIso) {
    var d = parseIsoDate(sIso);
    if (!d) return null;
    return { year: String(d.getFullYear()), month: pad2(d.getMonth() + 1) };
  }

  return {
    pad2: pad2,
    parseIsoDate: parseIsoDate,
    isYTD: isYTD,
    isMTD: isMTD,
    getYearMonthFromIso: getYearMonthFromIso
  };
});
