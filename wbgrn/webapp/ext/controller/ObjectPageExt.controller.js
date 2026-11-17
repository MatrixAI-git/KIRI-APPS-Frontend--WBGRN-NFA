sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (MessageToast, Fragment) {
    'use strict';

    return {

        onRefreshPhysicalQty: function () {
            if (this.extensionAPI) {
                this.extensionAPI.refresh();
            } else {
                this.getView().getModel().refresh();
            }
        },




        onUploadPress: function (oEvent) {

            var that = this;

            var oInput = document.createElement("input");
            oInput.type = "file";
            oInput.accept = ".xlsx,.xls,.csv";

            oInput.onchange = function (oFileEvent) {

                var oFile = oFileEvent.target.files[0];
                if (!oFile) return;

                MessageToast.show("File Selected: " + oFile.name);

                var sFileName = oFile.name.toLowerCase();
                var bIsCsv = sFileName.endsWith(".csv");

                var reader = new FileReader();

                reader.onload = function (e) {

                    var aExcelData;

                    try {
                        if (bIsCsv) {
                            // CSV: read as text, let XLSX parse it as a CSV sheet
                            var sCsvText = e.target.result;
                            var workbook = XLSX.read(sCsvText, { type: "string" });
                            var sSheetName = workbook.SheetNames[0];
                            var oSheet = workbook.Sheets[sSheetName];
                            aExcelData = XLSX.utils.sheet_to_json(oSheet, { raw: false });
                        } else {
                            // XLSX/XLS: read as binary
                            var data = e.target.result;
                            var workbook = XLSX.read(data, { type: "binary" });
                            var sSheetName = workbook.SheetNames[0];
                            var oSheet = workbook.Sheets[sSheetName];
                            aExcelData = XLSX.utils.sheet_to_json(oSheet);
                        }
                    } catch (oParseError) {
                        console.error("Parse Failed", oParseError);
                        MessageToast.show("Could not parse the file. Please check the format.");
                        return;
                    }

                    console.log("Parsed JSON Data:", aExcelData);
                    MessageToast.show("Rows Found: " + aExcelData.length);

                    var oView = that.getView();
                    var oBindingContext = oView.getBindingContext();

                    if (!oBindingContext) {
                        MessageToast.show("Could not retrieve binding context");
                        return;
                    }

                    var oModel = oBindingContext.getModel();
                    var oData = oBindingContext.getObject();
                    var sEbeln = oData.ebeln;
                    var sEbelp = oData.ebelp;   
                    if (!sEbeln) {
                        MessageToast.show("Could not determine Purchase Order (ebeln)");
                        return;
                    }

                    oModel.callFunction("/uploadGlData", {
                        method: "POST",
                        urlParameters: {
                            "ebeln": sEbeln,
                            "ebelp": sEbelp, 
                            "JsonPayload": JSON.stringify(aExcelData)
                        },
                        success: function (oResult, oResponse) {
                            MessageToast.show("Records Uploaded Successfully");

                            if (that.extensionAPI) {
                                that.extensionAPI.refresh();
                            } else {
                                oModel.refresh();
                            }
                        },
                        error: function (oError) {
                            console.error("Upload Failed", oError);
                            MessageToast.show("Upload failed. Check console for details.");
                        }
                    });
                };

                // Read differently based on file type
                if (bIsCsv) {
                    reader.readAsText(oFile);
                } else {
                    reader.readAsBinaryString(oFile);
                }
            };

            oInput.click();
        },

        // ---- Fetch by Token ----

        onFetchByTokenPress: function () {
            var that = this;

            if (!this._oTokenDialog) {
                var sFragmentId = this.getView().getId() + "--tokenFetch";
                this._sFragmentId = sFragmentId;

                Fragment.load({
                    id: sFragmentId,
                    name: "com.rap.matrix.wbgrn.ext.fragment.TokenPrompt",
                    controller: this
                }).then(function (oDialog) {
                    that._oTokenDialog = oDialog;
                    that.getView().addDependent(oDialog);
                    that._restoreFolderHandle().then(function () {
                        oDialog.open();
                    });
                });
            } else {
                this._restoreFolderHandle().then(function () {
                    that._oTokenDialog.open();
                });
            }
        },

        // helper: correct way to reach controls inside a fragment loaded outside a View
        _byId: function (sId) {
            return Fragment.byId(this._sFragmentId, sId);
        },

        onCancelTokenPrompt: function () {
            this._oTokenDialog.close();
        },

        onConnectFolder: async function () {
            console.log("Running inside iframe?", window.self !== window.top);

            if (typeof window.showDirectoryPicker !== "function") {
                console.error("showDirectoryPicker is not available in this browser/context.");
                MessageToast.show("Folder picker not supported here. Try opening the app in a new browser tab (outside Fiori Launchpad).");
                return;
            }

            try {
                this._dirHandle = await window.showDirectoryPicker();
                await this._saveFolderHandle(this._dirHandle);
                this._byId("folderStatusText").setText("Folder connected");
            } catch (e) {
                console.error("showDirectoryPicker FAILED:", e.name, "-", e.message);

                if (e.name === "AbortError") {
                    return;
                }
                MessageToast.show("Folder access denied (" + e.name + "). Check console for details.");
            }
        },

        // ---- IndexedDB persistence (native browser API, CSP-safe) ----

        _openHandleDB: function () {
            return new Promise(function (resolve, reject) {
                var req = indexedDB.open("wbGrnHandles", 1);
                req.onupgradeneeded = function () {
                    req.result.createObjectStore("handles");
                };
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function () { reject(req.error); };
            });
        },

        _saveFolderHandle: async function (handle) {
            try {
                var db = await this._openHandleDB();
                await new Promise(function (resolve, reject) {
                    var tx = db.transaction("handles", "readwrite");
                    tx.objectStore("handles").put(handle, "wbGrnFolderHandle");
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function () { reject(tx.error); };
                });
            } catch (e) {
                console.warn("Could not save folder handle to IndexedDB", e);
            }
        },

        _getSavedFolderHandle: async function () {
            try {
                var db = await this._openHandleDB();
                return await new Promise(function (resolve, reject) {
                    var tx = db.transaction("handles", "readonly");
                    var req = tx.objectStore("handles").get("wbGrnFolderHandle");
                    req.onsuccess = function () { resolve(req.result || null); };
                    req.onerror = function () { reject(req.error); };
                });
            } catch (e) {
                console.warn("Could not read folder handle from IndexedDB", e);
                return null;
            }
        },

        _restoreFolderHandle: async function () {
            var that = this;

            if (this._dirHandle) {
                this._byId("folderStatusText").setText("Folder connected ✓");
                return;
            }

            var handle = await this._getSavedFolderHandle();

            if (handle) {
                try {
                    var perm = await handle.queryPermission({ mode: "read" });
                    if (perm !== "granted") {
                        perm = await handle.requestPermission({ mode: "read" });
                    }
                    if (perm === "granted") {
                        that._dirHandle = handle;
                        that._byId("folderStatusText").setText("Folder connected ✓ ");
                    } else {
                        that._byId("folderStatusText").setText("Click Connect Folder (permission needed)");
                    }
                } catch (e) {
                    console.warn("Could not restore folder handle", e);
                    that._byId("folderStatusText").setText("Click Connect Folder (restore failed)");
                }
            } else {
                that._byId("folderStatusText").setText("Click Connect Folder (first time only)");
            }
        },

        onConfirmFetchByToken: async function () {
    var that = this;
    var sToken = this._byId("tokenPromptInput").getValue().trim();

    if (!sToken) {
        MessageToast.show("Enter a Token Number first");
        return;
    }
    if (!this._dirHandle) {
        MessageToast.show("Connect the folder first");
        return;
    }

    var sFileName = sToken + ".csv";

    try {
        var fileHandle = await this._dirHandle.getFileHandle(sFileName);
        var file = await fileHandle.getFile();
        var sCsvText = await file.text();

        var workbook = XLSX.read(sCsvText, { type: "string" });
        var sSheetName = workbook.SheetNames[0];
        var oSheet = workbook.Sheets[sSheetName];
        var aExcelData = XLSX.utils.sheet_to_json(oSheet, { raw: false });

        if (!aExcelData.length) {
            MessageToast.show("File found but no rows parsed");
            return;
        }

        MessageToast.show("File Loaded: " + sFileName + " (" + aExcelData.length + " row(s))");

        var oView = that.getView();
        var oBindingContext = oView.getBindingContext();

        if (!oBindingContext) {
            MessageToast.show("Could not retrieve binding context");
            return;
        }

        var oModel = oBindingContext.getModel();
        var oData = oBindingContext.getObject();
        var sEbeln = oData.ebeln;
        var sEbelp = oData.ebelp;   

        if (!sEbeln) {
            MessageToast.show("Could not determine Purchase Order (ebeln)");
            return;
        }

        oModel.callFunction("/uploadGlData", {
            method: "POST",
            urlParameters: {
                "ebeln": sEbeln,
                "ebelp": sEbelp, 
                "JsonPayload": JSON.stringify(aExcelData)
            },
            success: function (oResult, oResponse) {
                MessageToast.show("Records Uploaded Successfully");
                that._oTokenDialog.close();
                if (that.extensionAPI) {
                    that.extensionAPI.refresh();
                } else {
                    oModel.refresh();
                }
            },
            error: function (oError) {
                console.error("Upload Failed", oError);
                MessageToast.show("Upload failed. Check console for details.");
            }
        });

    } catch (e) {
        console.error("getFileHandle FAILED:", e.name, "-", e.message);
        MessageToast.show('No file found for token "' + sToken + '" (expected ' + sFileName + ')');
    }
},
        

        onPostGRNPress: function () {
            var that = this;
            var oView = this.getView();
            var oBindingContext = oView.getBindingContext();

            if (!oBindingContext) {
                MessageToast.show("Could not retrieve binding context");
                return;
            }

            var oModel = oBindingContext.getModel();
            var oData = oBindingContext.getObject();
            var sEbeln = oData.ebeln;
            var sEbelp = oData.ebelp;

            if (!sEbeln) {
                MessageToast.show("Could not determine Purchase Order (ebeln)");
                return;
            }

            oModel.callFunction("/cretgate", {
                method: "POST",
                urlParameters: {
                    "ebeln": sEbeln,
                    "ebelp": sEbelp
                },
                success: function (oResult, oResponse) {

                    var oMessageManager = sap.ui.getCore().getMessageManager();
                    var aMessages = oMessageManager.getMessageModel().getData();

                    if (aMessages && aMessages.length > 0) {
                        aMessages.forEach(function (oMsg, iIndex) {
                            setTimeout(function () {
                                MessageToast.show(oMsg.message, { duration: 7000 });
                            }, iIndex * 5500);
                        });
                    } else {
                        MessageToast.show("Post GRN completed", { duration: 7000 });
                    }

                    if (that.extensionAPI) {
                        that.extensionAPI.refresh();
                    } else {
                        oModel.refresh();
                    }
                },
                error: function (oError) {
                    var sErrorText = "Post GRN failed. Check console for details.";
                    var aErrorTexts = [];

                    try {
                        // 1) Standard OData V2 error body lives in responseText, not the
                        //    sap-message header (that header is not set for this call).
                        if (oError.responseText) {
                            var oBody = JSON.parse(oError.responseText);
                            var oErr = oBody && oBody.error;

                            if (oErr) {
                                // Top-level message
                                if (oErr.message && oErr.message.value) {
                                    aErrorTexts.push(oErr.message.value);
                                }

                                // Detailed messages (e.g. one per failed material/PO)
                                var aDetails = oErr.innererror && oErr.innererror.errordetails;
                                if (aDetails && aDetails.length) {
                                    aDetails.forEach(function (oDetail) {
                                        if (oDetail.message && oDetail.severity !== "success") {
                                            aErrorTexts.push(oDetail.message);
                                        }
                                    });
                                }
                            }
                        }

                        // 2) Fallback: some responses still use the sap-message header instead
                        if (!aErrorTexts.length) {
                            var sHeaderMsg = oError.headers && oError.headers["sap-message"];
                            if (sHeaderMsg) {
                                var oMsg = JSON.parse(sHeaderMsg);
                                if (oMsg && oMsg.message) {
                                    aErrorTexts.push(
                                        typeof oMsg.message === "string" ? oMsg.message : oMsg.message.value
                                    );
                                }
                                if (oMsg && oMsg.details && oMsg.details.length) {
                                    oMsg.details.forEach(function (oDetail) {
                                        if (oDetail.message) {
                                            aErrorTexts.push(
                                                typeof oDetail.message === "string" ? oDetail.message : oDetail.message.value
                                            );
                                        }
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Could not parse error response", e);
                    }

                    // de-duplicate (top-level message often repeats the first errordetail)
                    aErrorTexts = aErrorTexts.filter(function (sText, iIndex) {
                        return sText && aErrorTexts.indexOf(sText) === iIndex;
                    });

                    console.error("Post GRN Failed - raw error object:", oError);

                    if (aErrorTexts.length > 0) {
                        aErrorTexts.forEach(function (sText, iIndex) {
                            setTimeout(function () {
                                MessageToast.show(sText);
                            }, iIndex * 3500);
                        });
                    } else {
                        MessageToast.show(sErrorText);
                    }
                }
            });

        }
    };
});