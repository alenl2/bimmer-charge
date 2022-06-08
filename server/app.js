//#region DIRTY HACKS!!! :)
const config = {
  username: process.env.BMW_USERNAME,
  password:  process.env.BMW_PASWORD,
  chargerUrl: process.env.CHARGER_URL,
  homeLat: parseFloat(process.env.HOME_LAT),
  homeLon: parseFloat(process.env.HOME_LON),
  targetVin: process.env.VIN,
}
console.log(config);

import axios from 'axios';

import "core-js/stable";
import "regenerator-runtime/runtime";

import express from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import apiMetrics from "prometheus-api-metrics";
import cors from "cors";

import { universalParseValue, allMetrics } from "./universalMetricParser";
import schedule from 'node-schedule';
import { Registry } from 'prom-client';
import spawnAsync from '@expo/spawn-async';

let isCarCharging = false;
let lockUpdate = false;
let isChargerCharing = false;

let forceBmwCharging = false;
let forceBmwNotCharging = false;

let latestCarData = {}
let latestChargerData = {}

let defaultTargetPercent = 80;
let targetPercent = defaultTargetPercent;
let totalBatteryCapacity = 32;

let app = express();
app.use(apiMetrics());
app.use(cors());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getState(state) {
  let estate;
  switch (state) {
    case 0:
      estate = "Starting";
      break;
    case 1:
      estate = "EV Not connected";
      break;
    case 2:
      estate = "EV Connected";
      break;
    case 3:
      estate = "Charging";
      break;
    case 4:
      estate = "Vent Required";
      break;
    case 5:
      estate = "Diode Check Failed";
      break;
    case 6:
      estate = "GFCI Fault";
      break;
    case 7:
      estate = "No Earth Ground";
      break;
    case 8:
      estate = "Stuck Relay";
      break;
    case 9:
      estate = "GFCI Self Test Failed";
      break;
    case 10:
      estate = "Over Temperature";
      break;
    case 11:
      estate = "Over Current";
      break;
    case 254:
    case 255:
      estate = "Waiting";
      break;
    default:
      estate = "Invalid";
      break;
  }
  return estate;
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

//This function takes in latitude and longitude of two location and returns the distance between them as the crow flies (in m)
function calcCrow(lat1, lon1, lat2, lon2) {
  let R = 6371; // km
  let dLat = toRad(lat2 - lat1);
  let dLon = toRad(lon2 - lon1);
  lat1 = toRad(lat1);
  lat2 = toRad(lat2);

  let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  let d = R * c;
  return d * 1000;
}

// Converts numeric degrees to radians
function toRad(Value) {
  return Value * Math.PI / 180;
}

async function getCarMetrics() {
  console.log("Updateing car metrics");
  let ret = { isCharging: false, carSoc: 0, isHome: false }

  const bl = await spawnAsync('bash', ['-c', "bimmerconnected status "+config.username+" "+ config.password + " rest_of_world"])

  console.log("START bimmerconnected ountput")
  console.log(bl.stderr);
  console.log("END bimmerconnected outout")
  
  let sample = bl.stdout;
  let data = JSON.parse(sample.substring(sample.indexOf('data:')+5));
  
  let car = data[0]

  
  //let status = data.status;
  //let attr = data.attributes;

  let deviceId = "bmw01";
  universalParseValue(car.vin, deviceId + "_" + "vin", deviceId);

  console.log(car);

  universalParseValue(car.vehicle_location.location.latitude, deviceId + "_" + "gpsLat", deviceId);
  universalParseValue(car.vehicle_location.location.longitude, deviceId + "_" + "gpsLng", deviceId);
  universalParseValue(car.vehicle_location.location.heading, deviceId + "_" + "heading", deviceId);
  universalParseValue(car.mileage[0], deviceId + "_" + "odo", deviceId);
  universalParseValue(car.fuel_and_battery.remaining_range_electric, deviceId + "_" + "beRemainingRangeElectric", deviceId);
  universalParseValue(car.fuel_and_battery.remaining_battery_percent, deviceId + "_" + "soc", deviceId);

  let toHome = calcCrow(config.homeLat, config.homeLon, car.vehicle_location.location.latitude, car.vehicle_location.location.longitude)
  if (toHome < 500) {
    ret.isHome = true;
  }
  if (car.fuel_and_battery.charging_status === "CHARGING") {
    ret.isCharging = true;
  }
  ret.carSoc = car.fuel_and_battery.remaining_battery_percent
  
  
  console.log("Parsed data from connected services")
  console.log(ret);
  
  console.log(ret);
  return ret;
}

async function getCarData() {
  while (true) {
    try {
      let data = await getCarMetrics();
      latestCarData = data;
      didLockUp = false;
      return data;
    } catch (err) {
      didLockUp = true;
      console.error(err);
      await sleep(60000);
    }
  }
}

async function getChargerData() {
  while (true) {
    try {
      let temp = await axios.get(config.chargerUrl + "/status")
      let ret = {state: getState(temp.data.state), session_energy: temp.data.session_energy}
      latestChargerData = ret;
      didLockUp = false;
      return ret
    } catch (err) {
      didLockUp = true;
      console.error(err);
    }
  }
}

async function setChargeLimit(kwh) {
  while (true) {
    try {
      let ret = await axios.get(config.chargerUrl + "/r?json=1&rapi=$SH+" + Math.ceil(kwh))
      console.log("CONFIGURED THE CHARGER TO CHARGE " + Math.ceil(kwh) + "kWh")
      didLockUp = false;
      return ret.data
    } catch (err) {
      didLockUp = true;
      console.error(err);
    }
  }
}

async function getChargeLimit() {
  while (true) {
    try {
      let ret = await axios.get(config.chargerUrl + "/r?json=1&rapi=$GH")

      let a = ret.data.ret.replace("$OK ", "");
      a = a.substring(0, a.indexOf('^'))
      if (a === "0") {
        a = "∞";
      } else {
        a = Math.ceil(parseFloat(a))
      }
      console.log("Will charge for " + a + "kWh")
      return a
    } catch (err) {
      console.error(err);
    }
  }
}

async function update() {
  if (lockUpdate) {
    return;
  }

  if(forceBmwNotCharging){
    return;
  }
  
  let data = await getChargerData();

  if (data.state == "Charging") {

    if (isChargerCharing == false) {
      //transition to charging state detected
      isChargerCharing = true;


      console.log("Charger transitioned to CHARGING STATE");

      //wait 60s for connected services to update the status
      lockUpdate = true;
      setTimeout(async function () {
        let carData = await getCarData();

        if ((carData.isCharging == true && carData.isHome && isCarCharging == false) || forceBmwCharging) {
          isCarCharging = true;
          console.log("TRANSITION WE ARE CHARGING BMW ON OPENEVSE!!!!");

          //update status from EVSE to get actual session energy
          let newData = await getChargerData();

          let sessionEnergy = parseFloat(newData.session_energy) / 1000

          let currentSoc = carData.carSoc;

          let targetKwh = totalBatteryCapacity * (targetPercent / 100)
          let currentCapacity = totalBatteryCapacity * (currentSoc / 100)
          let toCharge = targetKwh - currentCapacity + sessionEnergy;

          if(toCharge <= 0){
            await setChargeLimit(1);
          }else{
            await setChargeLimit(toCharge);
          }
          
        }
        lockUpdate = false;
      }, 60000);
    }

  } else {
    //not charging
    isChargerCharing = false;
    isCarCharging = false;
    forceBmwCharging = false;
    forceBmwNotCharging = false;
    targetPercent = defaultTargetPercent;
  }
}
let isUpdateRunning = false;

async function init() {
  isUpdateRunning = true;
  await getCarData();
  await update();
  isUpdateRunning = false;
}

schedule.scheduleJob((getRandomInt(58) + 1) + ' * * * *', async function () {
  if (lockUpdate == false) {
    await getCarData();
  }
});

let didLockUp = false;

setInterval(async function(){
  if(isUpdateRunning){
    console.log("Update not completing")
    didLockUp = true;
    return;
  }else{
    didLockUp = false;
  }
  isUpdateRunning = true;
  await update();
  isUpdateRunning = false;
}, 5000)



app.get('/status', async (req, res) => {
  res.json({isBimmerChargingAtHome: isCarCharging, carStatus: latestCarData, chargerStatus: latestChargerData, chargeLimit: await getChargeLimit(), didLockUp: didLockUp, targetPercent: targetPercent})
})

app.get('/forceBmwCharging', async (req, res) => {
  forceBmwCharging = true
  res.json({status: "OK"})
});

app.post('/setTargetPercent', async (req, res) => {
  console.log(req.body);
  targetPercent = req.body.targetPercent
  defaultTargetPercent = req.body.targetPercent
  isCarCharging = false;
  isChargerCharing = false;
  res.json({status: "OK"})
});

app.get('/forceBmwNotCharging', async (req, res) => {
  forceBmwCharging = false;
  await setChargeLimit(0);
  res.json({status: "OK"})
});


init();
console.log("App running on port 3000");
export default app;