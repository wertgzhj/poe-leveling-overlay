import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CharacterRuns, type RunData, type RunStore } from '../electron/profile/run.ts'
import type { ProfileMeta } from '../electron/profile/profile.ts'

// The settings file, as a plain object.
function memoryStore(seed: Partial<RunData> = {}): RunStore & { data: RunData } {
  const data: RunData = { actReached: {}, dismissedChoices: {}, pantheonUnlocked: {}, ...seed }
  return {
    data,
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value
    }
  }
}

const BUILD: ProfileMeta = {
  name: 'Berserker',
  class: 'Marauder',
  bandit: 'Alira',
  pantheon: { major: 'Soul of Lunaris', minor: 'Soul of Shakari' }
}

test('the act only moves forward', () => {
  const runs = new CharacterRuns(memoryStore())
  assert.equal(runs.act('Marauder1'), null, 'unknown until a zone says')
  assert.equal(runs.noteAct('Marauder1', 3), true)
  // Portalling back to Act 1's town must not hide the Act 3 list.
  assert.equal(runs.noteAct('Marauder1', 1), false)
  assert.equal(runs.act('Marauder1'), 3)
  // No character, or no act from the zone: nothing to note.
  assert.equal(runs.noteAct(null, 4), false)
  assert.equal(runs.noteAct('Marauder1', null), false)
})

test('the bandits are due from Act 2, the pantheon from Act 6, one at a time', () => {
  const runs = new CharacterRuns(memoryStore())
  runs.noteAct('Marauder1', 1)
  assert.equal(runs.choiceDue('Marauder1', BUILD), null, 'Act 1: nothing yet')

  runs.noteAct('Marauder1', 5)
  // Act 5: the bandits, and no pantheon yet — its gods are fought in Acts 6-10.
  assert.equal(runs.choiceDue('Marauder1', BUILD)?.id, 'bandit')
  runs.dismiss('Marauder1', 'bandit')
  assert.equal(runs.choiceDue('Marauder1', BUILD), null, 'Act 5: no pantheon yet')
  runs.forget('Marauder1')
  runs.noteAct('Marauder1', 6)
  // Both are due by Act 6, but the bar holds one: the bandits come first.
  const bandit = runs.choiceDue('Marauder1', BUILD)
  assert.equal(bandit?.id, 'bandit')
  assert.equal(bandit?.wants, 'help Alira')
  assert.deepEqual(bandit?.options, ['help Alira', 'help Kraityn', 'help Oak', 'kill all three'])

  assert.equal(runs.dismiss('Marauder1', 'bandit'), true)
  assert.equal(runs.dismiss('Marauder1', 'bandit'), false, 'already dismissed')
  const pantheon = runs.choiceDue('Marauder1', BUILD)
  assert.equal(pantheon?.id, 'pantheon')
  assert.equal(pantheon?.wants, 'Soul of Lunaris + Soul of Shakari')

  runs.dismiss('Marauder1', 'pantheon')
  assert.equal(runs.choiceDue('Marauder1', BUILD), null)
})

test('a profile that names no decision gets no reminder', () => {
  const runs = new CharacterRuns(memoryStore({ actReached: { Marauder1: 10 } }))
  assert.equal(runs.choiceDue('Marauder1', { name: 'x', class: 'Witch' }), null)
  assert.equal(runs.choiceDue('Marauder1', undefined), null)
  assert.equal(runs.choiceDue('Marauder1', { ...BUILD, bandit: 'Kill all' })?.wants, 'kill all three')
  // Only the two known reminders can be dismissed.
  assert.equal(runs.dismiss('Marauder1', 'something'), false)
  assert.equal(runs.dismiss(null, 'bandit'), false)
})

test("a fresh character forgets its namesake's run, and only its own", () => {
  const store = memoryStore({
    actReached: { Marauder1: 10, other: 6 },
    dismissedChoices: { Marauder1: ['bandit', 'pantheon'], other: ['bandit'] }
  })
  const runs = new CharacterRuns(store)
  runs.forget('Marauder1')
  // Back in Act 1, and the bandit reminder will come again.
  assert.equal(runs.act('Marauder1'), 1)
  runs.noteAct('Marauder1', 2)
  assert.equal(runs.choiceDue('Marauder1', BUILD)?.id, 'bandit')
  // Nobody else's run moves.
  assert.deepEqual(store.data.actReached.other, 6)
  assert.deepEqual(store.data.dismissedChoices.other, ['bandit'])
})

test('Pantheon powers are ticked per character, and a fresh character starts empty', () => {
  const store = memoryStore()
  const runs = new CharacterRuns(store)
  assert.deepEqual(runs.pantheon('Marauder1'), [])
  assert.equal(runs.togglePantheon('Marauder1', 'Soul of Tukohama'), true)
  assert.deepEqual(runs.pantheon('Marauder1'), ['Soul of Tukohama'])
  assert.deepEqual(runs.pantheon('other'), [])
  // Toggling again unticks it.
  runs.togglePantheon('Marauder1', 'Soul of Tukohama')
  assert.deepEqual(runs.pantheon('Marauder1'), [])
  runs.togglePantheon('Marauder1', 'Soul of Shakari')
  runs.forget('Marauder1')
  assert.deepEqual(runs.pantheon('Marauder1'), [])
  assert.equal(runs.togglePantheon(null, 'Soul of Shakari'), false)
})

