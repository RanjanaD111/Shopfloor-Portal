sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/odata/v2/ODataModel"
], function (Controller, MessageToast, MessageBox, JSONModel, ODataModel) {
  "use strict";

  return Controller.extend("shopfloor.portal.controller.Login", {
    onInit: function () {
      // nothing required; defaults are set on login
    },

    onLogin: function () {
      var oView = this.getView();
      var sUser = oView.byId("userId").getValue();
      var sPass = oView.byId("password").getValue();

      if (sUser && sPass) {
        var oModel = this.getOwnerComponent().getModel();
        var oOrdersODataModel = this._createOrdersModel(sUser, sPass);
        var oOrdersModel = new JSONModel(this._createEmptyOrdersData());

        oModel.setProperty("/busy", true);
        oModel.setProperty("/serviceStatus", "Connecting");
        oModel.setProperty("/user/name", sUser);
        oView.byId("loginMsg").setVisible(false);
        this.getOwnerComponent().setModel(oOrdersModel, "orders");
        this._oOrdersODataModel = oOrdersODataModel;
        this._sAuthHeader = "Basic " + window.btoa("K902033:Sayanda@09");

        oOrdersODataModel.metadataLoaded().then(function () {
          return this._loadOrdersData();
        }.bind(this)).then(function () {
          var oOrdersData = this.getOwnerComponent().getModel("orders").getData();
          var iProductionCount = (oOrdersData.ProdordSet || []).length;
          var iPlannedCount = (oOrdersData.PlanordSet || []).length;

          oModel.setProperty("/busy", false);
          oModel.setProperty("/authenticated", true);
          oModel.setProperty("/loginVisible", false);
          oModel.setProperty("/appVisible", true);
          oModel.setProperty("/serviceStatus", "Live SAP data (" + iProductionCount + " production, " + iPlannedCount + " planned)");
          MessageToast.show("Welcome, " + sUser);
        }.bind(this)).catch(function () {
          oModel.setProperty("/busy", false);
          oModel.setProperty("/serviceStatus", "Connection failed");
          MessageBox.error("Could not connect to the SAP order service. Check the user ID, password, and network access.");
        });
      } else {
        oView.byId("loginMsg").setVisible(true);
      }
    },

    onMonthYearChange: function () {
      if (this._oOrdersODataModel) {
        this.getOwnerComponent().getModel().setProperty("/busy", true);
        this._loadOrdersData({ keepSelectedPeriod: true }).then(function () {
          this.getOwnerComponent().getModel().setProperty("/busy", false);
        }.bind(this)).catch(function () {
          this.getOwnerComponent().getModel().setProperty("/busy", false);
          MessageBox.error("Could not fetch SAP orders for the selected period.");
        }.bind(this));
        return;
      }

      this._applyDateAndOrderFilters();
    },

    onLogout: function () {
      var oModel = this.getOwnerComponent().getModel();

      // reset UI + model state
      oModel.setProperty("/authenticated", false);
      oModel.setProperty("/loginVisible", true);
      oModel.setProperty("/appVisible", false);
      oModel.setProperty("/user/id", "");
      oModel.setProperty("/user/name", "");
      oModel.setProperty("/serviceStatus", "Not connected");

      oModel.setProperty("/filters/date/year", "");
      oModel.setProperty("/filters/date/month", "");

      oModel.setProperty("/metrics/activeProductionOrders", 0);
      oModel.setProperty("/metrics/plannedOrders", 0);
      oModel.setProperty("/metrics/releasedQuantity", 0);
      oModel.setProperty("/metrics/zeroQuantityOrders", 0);

      this._oOrdersODataModel = null;
      this.getOwnerComponent().setModel(null, "orders");
      this.getView().byId("password").setValue("");
    },

    onSearch: function (oEvent) {
      this.getOwnerComponent().getModel().setProperty("/filters/search", oEvent.getParameter("newValue"));
      this._applyOrderFilters();
    },

    onRefreshOrders: function () {
      var oOrdersModel = this._oOrdersODataModel;

      if (oOrdersModel) {
        this.getOwnerComponent().getModel().setProperty("/busy", true);
        this._loadOrdersData().then(function () {
          var oOrdersData = this.getOwnerComponent().getModel("orders").getData();
          var iProductionCount = (oOrdersData.ProdordSet || []).length;
          var iPlannedCount = (oOrdersData.PlanordSet || []).length;

          this.getOwnerComponent().getModel().setProperty("/busy", false);
          this.getOwnerComponent().getModel().setProperty("/serviceStatus", "Live SAP data (" + iProductionCount + " production, " + iPlannedCount + " planned)");
          MessageToast.show("SAP orders refreshed");
        }.bind(this)).catch(function () {
          this.getOwnerComponent().getModel().setProperty("/busy", false);
          MessageBox.error("Could not refresh SAP orders.");
        }.bind(this));
      }
    },

    onOrderPress: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("orders");
      var oOrder = oContext && oContext.getObject();

      if (!oOrder) {
        return;
      }

      MessageBox.information(this._buildOrderDetails(oOrder), {
        title: oOrder.Aufnr ? "Production Order " + oOrder.Aufnr : "Planned Order " + oOrder.Plnum
      });
    },

    onProductionUpdateFinished: function (oEvent) {
      this._updateMetrics();
    },

    onPlannedUpdateFinished: function (oEvent) {
      this._updateMetrics();
    },

    formatQuantity: function (sQuantity) {
      var fQuantity = Number(sQuantity);

      if (Number.isNaN(fQuantity)) {
        return sQuantity || "0";
      }

      return this._formatNumber(fQuantity);
    },

    formatSapDate: function (sDate) {
      if (!sDate || sDate === "00000000" || sDate === "0000-00-00") {
        return "-";
      }

      if (/^\d{8}$/.test(sDate)) {
        return sDate.slice(0, 4) + "-" + sDate.slice(4, 6) + "-" + sDate.slice(6, 8);
      }

      return sDate;
    },

    formatDateRange: function (sStart, sEnd) {
      return this.formatSapDate(sStart) + " - " + this.formatSapDate(sEnd);
    },

    formatTextWithFallback: function (sValue) {
      return sValue || "-";
    },

    _createOrdersModel: function (sUser, sPass) {
      return new ODataModel("/sap/opu/odata/sap/ZGW_SHOP_FLOOR_618_SRV/", {
        useBatch: false,
        defaultBindingMode: "OneWay",
        headers: {
          // Fixed credentials to avoid browser Basic-Auth popups.
          // NOTE: change these values if needed.
          Authorization: "Basic " + window.btoa("K902033:Sayanda@09")
        },
        // Prevent browser credential handling that triggers the auth popup.
        withCredentials: false
      });
    },

    _loadOrdersData: function (mOptions) {
      var oOrdersODataModel = this._oOrdersODataModel;
      var oFilterOptions = this._getBackendFilterOptions();

      if (!oOrdersODataModel) {
        return Promise.resolve();
      }

      return Promise.all([
        this._readOrderSet("/ProdordSet", oFilterOptions.production).catch(function () { return []; }),
        this._readOrderSet("/PlanordSet", oFilterOptions.planned).catch(function () { return []; })
      ]).then(function (aResults) {
        var oOrdersModel = this.getOwnerComponent().getModel("orders");

        oOrdersModel.setData({
          ProdordSet: aResults[0],
          PlanordSet: aResults[1],
          filtered: {
            ProdordSet: [],
            PlanordSet: []
          }
        });

        if (mOptions && mOptions.keepSelectedPeriod) {
          this._applyDateAndOrderFilters();
        } else {
          this._initMonthYearAndApplyFilters();
        }
      }.bind(this));
    },

    _readOrderSet: function (sPath, oBackendFilter) {
      if (oBackendFilter) {
        return this._fetchOrderSetJson(sPath, oBackendFilter).catch(function () {
          return this._fetchOrderSetXml(sPath, oBackendFilter);
        }.bind(this));
      }

      return new Promise(function (resolve, reject) {
        this._oOrdersODataModel.read(sPath, {
          success: function (oData) {
            var aResults = oData && oData.results ? oData.results : [];

            if (aResults.length) {
              resolve(aResults);
              return;
            }

            this._fetchOrderSetXml(sPath, oBackendFilter).then(resolve).catch(function () {
              resolve(aResults);
            });
          },
          error: function () {
            this._fetchOrderSetXml(sPath, oBackendFilter).then(resolve).catch(reject);
          }.bind(this)
        });
      }.bind(this));
    },

    _fetchOrderSetJson: function (sPath, oBackendFilter) {
      var sSetName = sPath.replace(/^\//, "");
      var sUrl = "/sap/opu/odata/sap/ZGW_SHOP_FLOOR_618_SRV/" + sSetName + this._buildBackendQueryString(oBackendFilter, true);

      return window.fetch(sUrl, {
        headers: {
          Accept: "application/json",
          Authorization: this._sAuthHeader || "Basic " + window.btoa("K902033:Sayanda@09")
        },
        credentials: "omit"
      }).then(function (oResponse) {
        if (!oResponse.ok) {
          throw new Error("Could not load " + sSetName);
        }
        return oResponse.json();
      }).then(function (oData) {
        return oData && oData.d && oData.d.results ? oData.d.results : [];
      });
    },

    _fetchOrderSetXml: function (sPath, oBackendFilter) {
      var sSetName = sPath.replace(/^\//, "");
      var sUrl = "/sap/opu/odata/sap/ZGW_SHOP_FLOOR_618_SRV/" + sSetName + this._buildBackendQueryString(oBackendFilter, false);

      return window.fetch(sUrl, {
        headers: {
          Accept: "application/atom+xml,application/xml,text/xml",
          Authorization: this._sAuthHeader || "Basic " + window.btoa("K902033:Sayanda@09")
        },
        credentials: "omit"
      }).then(function (oResponse) {
        if (!oResponse.ok) {
          throw new Error("Could not load " + sSetName);
        }
        return oResponse.text();
      }).then(function (sXml) {
        return this._parseOrderFeedXml(sXml);
      }.bind(this));
    },

    _parseOrderFeedXml: function (sXml) {
      var oXml = new window.DOMParser().parseFromString(sXml, "application/xml");
      var aEntries = Array.prototype.slice.call(oXml.getElementsByTagNameNS("http://www.w3.org/2005/Atom", "entry"));

      return aEntries.map(function (oEntry) {
        var oOrder = {};
        var aProperties = Array.prototype.slice.call(oEntry.getElementsByTagNameNS("http://schemas.microsoft.com/ado/2007/08/dataservices", "*"));

        aProperties.forEach(function (oProperty) {
          oOrder[oProperty.localName] = oProperty.textContent || "";
        });

        return oOrder;
      });
    },

    _getBackendFilterOptions: function () {
      var oModel = this.getOwnerComponent().getModel();
      var sYear = oModel.getProperty("/filters/date/year");
      var sMonth = oModel.getProperty("/filters/date/month");
      var oSelectedPeriod = this._getSelectedPeriod(sYear, sMonth);

      if (!sYear || !oSelectedPeriod || !oSelectedPeriod.start || !oSelectedPeriod.end) {
        return {
          production: null,
          planned: null
        };
      }

      return {
        production: this._createBackendDateFilter("Gstrp", "Gltrp", this._formatDateForBackend(oSelectedPeriod.start, true), this._formatDateForBackend(oSelectedPeriod.end, true), true),
        planned: this._createBackendDateFilter("Pedtr", "Pedtr", this._formatDateForBackend(oSelectedPeriod.start, false), this._formatDateForBackend(oSelectedPeriod.end, false), false)
      };
    },

    _createBackendDateFilter: function (sStartField, sEndField, sStartValue, sEndValue, bIsoDate) {
      return {
        startField: sStartField,
        endField: sEndField,
        startValue: sStartValue,
        endValue: sEndValue,
        invalidEndValue: bIsoDate ? "0000-00-00" : "00000000"
      };
    },

    _formatDateForBackend: function (dDate, bIsoDate) {
      var sYear = String(dDate.getFullYear());
      var sMonth = String(dDate.getMonth() + 1).padStart(2, "0");
      var sDay = String(dDate.getDate()).padStart(2, "0");

      return bIsoDate ? sYear + "-" + sMonth + "-" + sDay : sYear + sMonth + sDay;
    },

    _buildBackendQueryString: function (oBackendFilter, bJson) {
      var aQueryParts = [];

      if (oBackendFilter) {
        aQueryParts.push("$filter=" + window.encodeURIComponent(this._buildBackendFilterExpression(oBackendFilter)));
      }

      if (bJson) {
        aQueryParts.push("$format=json");
      }

      return aQueryParts.length ? "?" + aQueryParts.join("&") : "";
    },

    _buildBackendFilterExpression: function (oBackendFilter) {
      if (oBackendFilter.startField === oBackendFilter.endField) {
        return [
          oBackendFilter.endField + " ge '" + oBackendFilter.startValue + "'",
          oBackendFilter.endField + " le '" + oBackendFilter.endValue + "'"
        ].join(" and ");
      }

      return [
        oBackendFilter.startField + " le '" + oBackendFilter.endValue + "'",
        "(" + oBackendFilter.endField + " ge '" + oBackendFilter.startValue + "' or " + oBackendFilter.endField + " eq '' or " + oBackendFilter.endField + " eq '" + oBackendFilter.invalidEndValue + "')"
      ].join(" and ");
    },

    _createEmptyOrdersData: function () {
      return {
        ProdordSet: [],
        PlanordSet: [],
        filtered: {
          ProdordSet: [],
          PlanordSet: []
        }
      };
    },

    _initMonthYearAndApplyFilters: function () {
      var oModel = this.getOwnerComponent().getModel();
      var aAvailableYears = this._getDashboardYears();
      var oYearSelectForAvailableData = this.getView().byId("yearSelect");

      oModel.setProperty("/filters/date/year", "");
      oModel.setProperty("/filters/date/month", "");

      if (oYearSelectForAvailableData) {
        oYearSelectForAvailableData.removeAllItems();
        oYearSelectForAvailableData.addItem(new sap.ui.core.Item({ key: "", text: "All Years" }));
        aAvailableYears.forEach(function (y) {
          oYearSelectForAvailableData.addItem(new sap.ui.core.Item({ key: y, text: y }));
        });
      }

      this._applyDateAndOrderFilters();
    },

    _applyDateAndOrderFilters: function () {
      var oModel = this.getOwnerComponent().getModel();
      var oOrdersModel = this.getOwnerComponent().getModel("orders");
      var sSearch = oModel.getProperty("/filters/search");
      var sYear = oModel.getProperty("/filters/date/year");
      var sMonth = oModel.getProperty("/filters/date/month");
      var aProduction;
      var aPlanned;

      if (!oOrdersModel) {
        return;
      }

      aProduction = oOrdersModel.getProperty("/ProdordSet") || [];
      aPlanned = oOrdersModel.getProperty("/PlanordSet") || [];

      oOrdersModel.setProperty("/filtered/ProdordSet", this._filterOrders(aProduction, "production", sSearch, sYear, sMonth));
      oOrdersModel.setProperty("/filtered/PlanordSet", this._filterOrders(aPlanned, "planned", sSearch, sYear, sMonth));
      this._updateMetrics();
    },

    _filterOrders: function (aOrders, sOrderType, sSearch, sYear, sMonth) {
      return aOrders.filter(function (oOrder) {
        return this._doesOrderMatchSearch(oOrder, sOrderType, sSearch) && this._doesOrderMatchDate(oOrder, sOrderType, sYear, sMonth);
      }.bind(this));
    },

    _applyOrderFilters: function () {
      // Backward compatibility: keep existing search behavior by applying combined date+search
      this._applyDateAndOrderFilters();
    },

    _doesOrderMatchSearch: function (oOrder, sOrderType, sSearch) {
      var aFields = sOrderType === "production" ? ["Aufnr", "Auart", "Matnr", "Maktx", "Werks"] : ["Plnum", "Matnr", "Maktx", "Werks", "Dispo"];

      if (!sSearch) {
        return true;
      }

      sSearch = String(sSearch).toLowerCase();
      return aFields.some(function (sField) {
        return String(oOrder[sField] || "").toLowerCase().indexOf(sSearch) !== -1;
      });
    },

    _doesOrderMatchDate: function (oOrder, sOrderType, sYear, sMonth) {
      var oSelectedPeriod = this._getSelectedPeriod(sYear, sMonth);
      var oOrderRange;

      if (!oSelectedPeriod) {
        return true;
      }

      oOrderRange = this._getOrderDateRange(oOrder, sOrderType);
      if (!oOrderRange) {
        return false;
      }

      return this._rangesOverlap(oOrderRange.start, oOrderRange.end, oSelectedPeriod.start, oSelectedPeriod.end);
    },

    _getSelectedPeriod: function (sYear, sMonth) {
      var iYear = Number(sYear);
      var iMonth = Number(sMonth);

      if (sYear && sMonth) {
        return {
          start: new Date(iYear, iMonth - 1, 1),
          end: new Date(iYear, iMonth, 0)
        };
      }

      if (sYear) {
        return {
          start: new Date(iYear, 0, 1),
          end: new Date(iYear, 11, 31)
        };
      }

      if (sMonth) {
        return {
          start: { month: iMonth },
          end: { month: iMonth }
        };
      }

      return null;
    },

    _getOrderDateRange: function (oOrder, sOrderType) {
      var sStartField = sOrderType === "production" ? "Gstrp" : "Psttr";
      var sEndField = sOrderType === "production" ? "Gltrp" : "Pedtr";
      var dStart = this._parseSapDate(oOrder[sStartField]);
      var dEnd = this._parseSapDate(oOrder[sEndField]);

      if (sOrderType === "planned") {
        dStart = dEnd;
      }

      if (!dStart && !dEnd) {
        return null;
      }

      dStart = dStart || dEnd;
      dEnd = dEnd || dStart;

      if (dStart > dEnd) {
        return { start: dEnd, end: dStart };
      }

      return { start: dStart, end: dEnd };
    },

    _rangesOverlap: function (dOrderStart, dOrderEnd, vSelectedStart, vSelectedEnd) {
      if (vSelectedStart && vSelectedStart.month) {
        return this._rangeContainsMonth(dOrderStart, dOrderEnd, vSelectedStart.month);
      }

      return dOrderStart <= vSelectedEnd && dOrderEnd >= vSelectedStart;
    },

    _rangeContainsMonth: function (dStart, dEnd, iMonth) {
      var dCursor = new Date(dStart.getFullYear(), dStart.getMonth(), 1);
      var dStop = new Date(dEnd.getFullYear(), dEnd.getMonth(), 1);

      while (dCursor <= dStop) {
        if (dCursor.getMonth() + 1 === iMonth) {
          return true;
        }
        dCursor.setMonth(dCursor.getMonth() + 1);
      }

      return false;
    },

    _parseSapDate: function (vDate) {
      var aMatch;

      if (!vDate || vDate === "00000000" || vDate === "0000-00-00") {
        return null;
      }

      if (vDate instanceof Date) {
        return new Date(vDate.getFullYear(), vDate.getMonth(), vDate.getDate());
      }

      vDate = String(vDate);

      if (/^\d{8}$/.test(vDate)) {
        return new Date(Number(vDate.slice(0, 4)), Number(vDate.slice(4, 6)) - 1, Number(vDate.slice(6, 8)));
      }

      aMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(vDate);
      if (aMatch) {
        return new Date(Number(aMatch[1]), Number(aMatch[2]) - 1, Number(aMatch[3]));
      }

      aMatch = /^\/Date\((\d+)\)\/$/.exec(vDate);
      if (aMatch) {
        return this._parseSapDate(new Date(Number(aMatch[1])));
      }

      return null;
    },

    _getDashboardYears: function () {
      var aYears = [];
      var iYear;

      for (iYear = 2020; iYear <= 2030; iYear++) {
        aYears.push(String(iYear));
      }

      return aYears;
    },

    _getAvailableYears: function () {
      var oOrdersModel = this.getOwnerComponent().getModel("orders");
      var oYears = {};
      var aAllOrders;

      if (!oOrdersModel) {
        return [];
      }

      aAllOrders = (oOrdersModel.getProperty("/ProdordSet") || []).map(function (oOrder) {
        return { order: oOrder, type: "production" };
      }).concat((oOrdersModel.getProperty("/PlanordSet") || []).map(function (oOrder) {
        return { order: oOrder, type: "planned" };
      }));

      aAllOrders.forEach(function (oEntry) {
        var oRange = this._getOrderDateRange(oEntry.order, oEntry.type);

        if (oRange) {
          oYears[String(oRange.start.getFullYear())] = true;
          oYears[String(oRange.end.getFullYear())] = true;
        }
      }.bind(this));

      return Object.keys(oYears).sort();
    },

    _updateMetrics: function () {
      var oModel = this.getOwnerComponent().getModel();
      var oOrdersModel = this.getOwnerComponent().getModel("orders");
      var aProduction = oOrdersModel ? oOrdersModel.getProperty("/filtered/ProdordSet") || [] : [];
      var aPlanned = oOrdersModel ? oOrdersModel.getProperty("/filtered/PlanordSet") || [] : [];
      var iQuantity = 0;
      var iZeroQuantity = 0;

      aProduction.forEach(function (oOrder) {
        var fQuantity = Number(oOrder.Gamng) || 0;

        iQuantity += fQuantity;
        if (!fQuantity) {
          iZeroQuantity += 1;
        }
      });

      oModel.setProperty("/metrics/activeProductionOrders", aProduction.length);
      oModel.setProperty("/metrics/plannedOrders", aPlanned.length);
      oModel.setProperty("/metrics/releasedQuantity", this._formatNumber(iQuantity));
      oModel.setProperty("/metrics/zeroQuantityOrders", iZeroQuantity);
    },

    _buildOrderDetails: function (oOrder) {
      if (oOrder.Aufnr) {
        return [
          "Type: " + this.formatTextWithFallback(oOrder.Auart),
          "Material: " + this.formatTextWithFallback(oOrder.Matnr),
          "Description: " + this.formatTextWithFallback(oOrder.Maktx),
          "Plant: " + this.formatTextWithFallback(oOrder.Werks),
          "Quantity: " + this.formatQuantity(oOrder.Gamng) + " " + this.formatTextWithFallback(oOrder.Meins),
          "Dates: " + this.formatDateRange(oOrder.Gstrp, oOrder.Gltrp),
          "Created: " + this.formatSapDate(oOrder.Erdat)
        ].join("\n");
      }

      return [
        "Material: " + this.formatTextWithFallback(oOrder.Matnr),
        "Description: " + this.formatTextWithFallback(oOrder.Maktx),
        "Plant: " + this.formatTextWithFallback(oOrder.Werks),
        "Quantity: " + this.formatQuantity(oOrder.Gsmng) + " " + this.formatTextWithFallback(oOrder.Meins),
        "Dates: " + this.formatDateRange(oOrder.Psttr, oOrder.Pedtr),
        "MRP Controller: " + this.formatTextWithFallback(oOrder.Dispo),
        "Created By: " + this.formatTextWithFallback(oOrder.Ernam),
        "Created: " + this.formatSapDate(oOrder.Erdat)
      ].join("\n");
    },

    _formatNumber: function (vNumber) {
      return Number(vNumber).toLocaleString("en-US", {
        maximumFractionDigits: 3
      });
    },

    formatNumberLarge: function (vNumber) {
      if (vNumber === undefined || vNumber === null) {
        return "0";
      }
      return this._formatNumber(vNumber);
    }
  });
});
