sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "sap/ui/Device"
], function (UIComponent, JSONModel, Device) {
  "use strict";

  return UIComponent.extend("shopfloor.portal.Component", {
    metadata: {
      manifest: "json"
    },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      this.setModel(new JSONModel({
        busy: false,
        isPhone: Device.system.phone,
        authenticated: false,
        loginVisible: true,
        appVisible: false,
        searchWidth: Device.system.phone ? "12rem" : "18rem",
        user: {
          id: "",
          name: "",
          role: "Shift Supervisor"
        },
        filters: {
          search: "",
          date: {
            year: "",
            month: ""
          }
        },
        serviceStatus: "Not connected",
        metrics: {
          activeProductionOrders: 0,
          plannedOrders: 0,
          releasedQuantity: 0,
          zeroQuantityOrders: 0
        }
      }));
    }
  });
});
