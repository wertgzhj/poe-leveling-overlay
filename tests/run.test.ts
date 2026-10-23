import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CharacterRuns, type RunData, type RunStore } from '../electron/profile/run.ts'
import type { ProfileMeta } from '../electron/profile/profile.ts'

// The settings file, as a plain object.
function memoryStore(seed: Partial<RunData> = {}): RunStore & { data: RunData } {
  const data: RunData = { actReached: {}, dismissedChoices: {}, ...seed }
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
  assert.equal(runs.act('manauda'), null, 'unknown until a zone says')
  assert.equal(runs.noteAct('manauda', 3), true)
  // Portalling back to Act 1's town must not hide the Act 3 list.
  assert.equal(runs.noteAct('manauda', 1), false)
  assert.equal(runs.act('manauda'), 3)
  // No character, or no act from the zone: nothing to note.
  assert.equal(runs.noteAct(null, 4), false)
  assert.equal(runs.noteAct('manauda', null), false)
})

test('the bandits are due from Act 2, the pantheon from Act 5, one at a time', () => {
  const runs = new CharacterRuns(memoryStore())
  runs.noteAct('manauda', 1)
  assert.equal(runs.choiceDue('manauda', BUILD), null, 'Act 1: nothing yet')

  runs.noteAct('manauda', 5)
  // Both are due by Act 5, but the bar holds one: the bandits come first.
  const bandit = runs.choiceDue('manauda', BUILD)
  assert.equal(bandit?.id, 'bandit')
  assert.equal(bandit?.wants, 'help Alira')
  assert.deepEqual(bandit?.options, ['help Alira', 'help Kraityn', 'help Oak', 'kill all three'])

  assert.equal(runs.dismiss('manauda', 'bandit'), true)
  assert.equal(runs.dismiss('manauda', 'bandit'), false, 'already dismissed')
  const pantheon = runs.choiceDue('manauda', BUILD)
  assert.equal(pantheon?.id, 'pantheon')
  assert.equal(pantheon?.wants, 'Soul of Lunaris + Soul of Shakari')

  runs.dismiss('manauda', 'pantheon')
  assert.equal(runs.choiceDue('manauda', BUILD), null)
})

test('a profile that names no decision gets no reminder', () => {
  const runs = new CharacterRuns(memoryStore({ actReached: { manauda: 10 } }))
  assert.equal(runs.choiceDue('manauda', { name: 'x', class: 'Witch' }), null)
  assert.equal(runs.choiceDue('manauda', undefined), null)
  assert.equal(runs.choiceDue('manauda', { ...BUILD, bandit: 'Kill all' })?.wants, 'kill all three')
  // Only the two known reminders can be dismissed.
  assert.equal(runs.dismiss('manauda', 'something'), false)
  assert.equal(runs.dismiss(null, 'bandit'), false)
})

test("a fresh character forgets its namesake's run, and only its own", () => {
  const store = memoryStore({
    actReached: { manauda: 10, other: 6 },
    dismissedChoices: { manauda: ['bandit', 'pantheon'], other: ['bandit'] }
  })
  const runs = new CharacterRuns(store)
  runs.forget('manauda')
  // Back in Act 1, and the bandit reminder will come again.
  assert.equal(runs.act('manauda'), 1)
  runs.noteAct('manauda', 2)
  assert.equal(runs.choiceDue('manauda', BUILD)?.id, 'bandit')
  // Nobody else's run moves.
  assert.deepEqual(store.data.actReached.other, 6)
  assert.deepEqual(store.data.dismissedChoices.other, ['bandit'])
})
