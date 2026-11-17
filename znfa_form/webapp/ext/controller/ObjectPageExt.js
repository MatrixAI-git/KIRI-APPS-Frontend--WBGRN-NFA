sap.ui.define([
    "sap/m/MessageToast"
], function(MessageToast) {
    'use strict';

    return {
         onPrintClicked: function (oBindingContext, aSelectedContexts) {

           

            var oContext = aSelectedContexts[0];
            var oModel = oContext.getModel();

            BusyIndicator.show(0);

            var oActionBinding = oModel.bindContext(
                "com.sap.gateway.srvd.zsd_nfa_form.v0001.downloadPDF(...)",
                oContext

            );

            oActionBinding.execute().then(function () {
                var oResult = oActionBinding.getBoundContext().getObject();

                if (!oResult || !oResult.PdfBase64) {
                    BusyIndicator.hide();
                    MessageToast.show("No PDF data returned.");
                    return;
                }

                try {
                    //     var sBinary = atob(oResult.PdfBase64);
                    //     var aBytes = new Uint8Array(sBinary.length);
                    //     for (var i = 0; i < sBinary.length; i++) {
                    //         aBytes[i] = sBinary.charCodeAt(i);
                    //     }
                    //     var oBlob = new Blob([aBytes], { type: "application/pdf" });
                    //     var sUrl = URL.createObjectURL(oBlob);
                    //     var oLink = document.createElement("a");
                    //     oLink.href = sUrl;
                    //     oLink.download = oResult.FileName || "PR_Download.pdf";
                    //     document.body.appendChild(oLink);
                    //     oLink.click();
                    //     document.body.removeChild(oLink);
                    //     URL.revokeObjectURL(sUrl);
                    //     BusyIndicator.hide();
                    //     MessageToast.show("PDF downloaded!");
                    // } catch(e) {
                    //     BusyIndicator.hide();
                    //     MessageToast.show("Error: " + e.message);
                    // }
                    var sBinary = atob(oResult.PdfBase64);
                    var aBytes = new Uint8Array(sBinary.length);
                    for (var i = 0; i < sBinary.length; i++) {
                        aBytes[i] = sBinary.charCodeAt(i);
                    }
                    var oBlob = new Blob([aBytes], { type: "application/pdf" });
                    var sUrl = URL.createObjectURL(oBlob);

                    // Opens PDF preview
                    window.open(sUrl, "_blank");

                    setTimeout(function () {
                        URL.revokeObjectURL(sUrl); // clean up
                    }, 10000);

                    BusyIndicator.hide();
                    MessageToast.show("PDF preview opened!");
                } catch (e) {
                    BusyIndicator.hide();
                    MessageToast.show("Error: " + e.message);
                }

            }).catch(function (oError) {
                BusyIndicator.hide();
                MessageToast.show("Error: " + (oError.message || "Failed"));
            });
        },
    }
});
