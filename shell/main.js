/* Copyright 2017 Mozilla
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
const { console } = Cu.import("resource://gre/modules/Console.jsm", {});
const { Runtime } = Cu.import("resource:///modules/Runtime.jsm", {});
const { Services } = Cu.import("resource://gre/modules/Services.jsm", {});

const WINDOW_FEATURES = [
  "width=640",
  "height=480",
  "resizable",
  "scrollbars",
].join(",");

// On startup, activate ourselves, since starting up from Node doesn't do this.
// TODO: do this by default for all apps started via Node.
if (Services.appinfo.OS === 'Darwin') {
  Cc["@mozilla.org/widget/macdocksupport;1"].getService(Ci.nsIMacDockSupport).activateApplication(true);
}

const window = Services.ww.openWindow(null, Runtime.arguments[0], "_blank", WINDOW_FEATURES, null);
Runtime.openDevTools(window);
