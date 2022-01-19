const prom = require("prom-client");

var metricsDict = {};
var allMetrics = {};

function isNumeric(str) {
  if (typeof str != "string") return false;
  return !isNaN(str) && !isNaN(parseFloat(str));
}

const universalParseValue = (valueRaw, metricName, deviceId) => {
  if (valueRaw === undefined || valueRaw === null) {
    valueRaw = "0";
  }
  if (deviceId === "" || deviceId === undefined || metricName === "" || metricName === undefined) {
    console.error({ device: deviceId, metric: metricName, valueRaw: valueRaw });
    return;
  }

  valueRaw = valueRaw.toString();

  var value = Number(valueRaw);
  if (valueRaw === "yes") {
    value = 1;
  }
  if (valueRaw === "no") {
    value = 0;
  }

  if (valueRaw === "true") {
    value = 1;
  }
  if (valueRaw === "false") {
    value = 0;
  }

  if (valueRaw === "SECURED") {
    value = 1;
  }
  if (valueRaw === "UNSECURED") {
    value = 0;
  }

  if (valueRaw === "LOCKED") {
    value = 1;
  }
  if (valueRaw === "UNLOCKED") {
    value = 0;
  }

  if (valueRaw === "CHARGING") {
    value = 1;
  }
  if (valueRaw === "NOCHARGING") {
    value = 0;
  }

  if (valueRaw === "CLOSED") {
    value = 1;
  }
  if (valueRaw === "OPEN") {
    value = 0;
  }

  if (valueRaw === "CONNECTED") {
    value = 1;
  }
  if (valueRaw === "DISCONNECTED") {
    value = 0;
  }

  if (valueRaw === "INVALID") {
    value = -1;
  }

  var valueListRaw = valueRaw.split(",");
  var valueList = [];
  for (var val of valueListRaw) {
    if (isNumeric(val)) {
      valueList.push(Number(val));
    } else {
      valueList = [];
      break;
    }
  }
  if (valueList.length == 0) {
    valueList = [value];
  }
  if (metricsDict[metricName] === undefined) {
    const gauge = new prom.Gauge({ name: metricName, help: "No Help!", labelNames: ["valueRaw", "device", "metricIndex"] });
    metricsDict[metricName] = gauge;
  }

  var retmetrics = [];
  for (var i = 0; i < valueList.length; i++) {
    var rawV = valueRaw;
    if (isNaN(valueList[i]) == false) {
      rawV = "null"; //no need since its already in there
    }
    var gauge = metricsDict[metricName];
    gauge.set({ valueRaw: rawV, device: deviceId, metricIndex: i }, valueList[i]);

    allMetrics[metricName + "_" + i] = valueList[i];

    retmetrics.push({ device: deviceId, metric: metricName, value: value, valueRaw: valueRaw });
  }
  return retmetrics;
};

module.exports = { universalParseValue: universalParseValue, allMetrics: allMetrics };
