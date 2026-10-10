import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeDroughtPlace } from './droughtOutlook.js';

const place = {
  id: 'test',
  name: 'Test City',
  region: 'Test Region',
  location: [10, 120],
};

function monthlyClimateArchive() {
  const precipitation = {};
  for (let year = 1991; year <= 2020; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      precipitation[`${year}${String(month).padStart(2, '0')}`] = month === 1 ? 10 : month === 2 ? 20 : 5;
    }
    precipitation[`${year}13`] = 12;
  }
  return { properties: { parameter: { PRECTOTCORR: precipitation } } };
}

function forecastForCrossMonthWindow(rainfall) {
  const time = [];
  const precipitation = [];
  for (let day = 25; day <= 31; day += 1) {
    time.push(`2026-01-${String(day).padStart(2, '0')}`);
    precipitation.push(rainfall.january);
  }
  for (let day = 1; day <= 9; day += 1) {
    time.push(`2026-02-${String(day).padStart(2, '0')}`);
    precipitation.push(rainfall.february);
  }
  return { daily: { time, precipitation_sum: precipitation } };
}

test('compares forecast rainfall with matching NASA monthly climate normals', () => {
  const result = summarizeDroughtPlace(
    place,
    forecastForCrossMonthWindow({ january: 5, february: 10 }),
    monthlyClimateArchive()
  );

  assert.equal(result.rainfallPercent, 50);
  assert.equal(result.forecastMm, 125);
  assert.equal(result.normalMm, 250);
  assert.equal(result.status, 'Below-normal rain signal');
  assert.equal(result.startDate, '2026-01-25');
  assert.equal(result.endDate, '2026-02-09');
});

test('reports a normal outlook when forecast precipitation matches the climatological rate', () => {
  const result = summarizeDroughtPlace(
    place,
    forecastForCrossMonthWindow({ january: 10, february: 20 }),
    monthlyClimateArchive()
  );

  assert.equal(result.rainfallPercent, 100);
  assert.equal(result.status, 'Normal or wetter outlook');
});
