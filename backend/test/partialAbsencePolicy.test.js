const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePartialAbsence,
  scheduledMinutesBefore,
} = require('../dist/modules/rrhh/domain/partialAbsencePolicy');

const splitSchedule = {
  startTime: '09:00:00',
  endTime: '19:00:00',
  lunchEnabled: true,
  lunchStartFrom: '13:00:00',
  lunchDurationMinutes: 120,
};

const tolerantSchedule = {
  ...splitSchedule,
  entryToleranceMinutes: 10,
  returnToleranceMinutes: 10,
};

describe('partialAbsencePolicy', () => {
  it('excluye el almuerzo al calcular una entrada en la tarde', () => {
    assert.equal(scheduledMinutesBefore(splitSchedule, (17 * 60) + 20), 380);
  });

  it('calcula solo los minutos laborables no cubiertos', () => {
    assert.deepEqual(calculatePartialAbsence(splitSchedule, {
      entry: (17 * 60) + 20,
      lunchOut: null,
      lunchReturn: null,
      exit: (20 * 60) + 46,
    }), {
      scheduledMinutes: 480,
      coveredScheduledMinutes: 100,
      missedMinutes: 380,
    });
  });

  it('detecta una ausencia parcial posterior al almuerzo', () => {
    assert.deepEqual(calculatePartialAbsence(splitSchedule, {
      entry: 9 * 60,
      lunchOut: 13 * 60,
      lunchReturn: (15 * 60) + 30,
      exit: 19 * 60,
    }), {
      scheduledMinutes: 480,
      coveredScheduledMinutes: 450,
      missedMinutes: 30,
    });
  });

  it('no descuenta minutos cubiertos por las tolerancias autorizadas', () => {
    assert.deepEqual(calculatePartialAbsence(tolerantSchedule, {
      entry: (9 * 60) + 5,
      lunchOut: 13 * 60,
      lunchReturn: (15 * 60) + 5,
      exit: 19 * 60,
    }), {
      scheduledMinutes: 480,
      coveredScheduledMinutes: 480,
      missedMinutes: 0,
    });
  });

  it('respeta un almuerzo completo desplazado dentro de la ventana operativa', () => {
    assert.deepEqual(calculatePartialAbsence(splitSchedule, {
      entry: 9 * 60,
      lunchOut: (13 * 60) + 30,
      lunchReturn: (15 * 60) + 30,
      exit: 19 * 60,
    }), {
      scheduledMinutes: 480,
      coveredScheduledMinutes: 480,
      missedMinutes: 0,
    });
  });
});
