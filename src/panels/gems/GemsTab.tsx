import { Fragment } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sourceName, sourceTone } from '../../lib/sources'
import { HEADING } from '../../lib/ui'
import { useOverlayStore } from '../../stores/overlayStore'
import { article, ErrorBox } from '../shared'
import { SocketGroup } from './LinkGroup'
import { MulePicker } from './MulePicker'
import { BuyRow, RewardGroupRow } from './PlanRows'

// The Gems tab: what to socket at your level, and where each gem comes from.

export function GemBody(): React.JSX.Element {
  const { profile, guide } = useOverlayStore(
    useShallow((s) => ({ profile: s.profile, guide: s.guide }))
  )

  if (profile?.errors && profile.errors.length > 0 && !profile.activeStage) {
    return <ErrorBox title="Profile file problems:" errors={profile.errors} />
  }
  if (!profile || !profile.meta) {
    return <p className="px-1 text-xs text-overlay-muted">No build profile — point Settings → Build profile at your file.</p>
  }

  const stage = profile.activeStage
  const cursorStep = guide?.route?.steps.find((s) => s.id === guide.cursorStepId)
  const atReward = cursorStep?.rewardHint === true
  // Manual stage paging (◀/▶): the shown stage may differ from the live one.
  const { stageCount, viewedIndex, liveIndex } = profile
  const onLiveStage = viewedIndex === liveIndex
  const canPrev = viewedIndex > 0
  const canNext = viewedIndex >= 0 && viewedIndex < stageCount - 1
  // One merged, chronologically-ordered acquisition list (rewards + buys),
  // reward-first on ties (owner: don't buy what you can take free).
  const plan = profile.acquisitions?.plan ?? []
  // gem (lowercased) -> its acquisition entry, for the inline tags on link rows.
  const acqByGem = new Map<string, AcquisitionEntryBridge>()
  for (const e of [
    ...(profile.acquisitions?.rewards ?? []),
    ...(profile.acquisitions?.purchases ?? []),
    ...(profile.acquisitions?.other ?? [])
  ]) {
    acqByGem.set(e.gem.toLowerCase(), e)
  }
  const freshGems = new Set(profile.acquisitions?.newGems ?? [])

  return (
    <>
      {profile.errors.length > 0 && <ErrorBox title="Profile file problems:" errors={profile.errors} />}
      {/* Without gem data every gem is colourless and sourceless — that looks
          like missing curation rather than a broken install, so name it. */}
      {profile.gemDataError && (
        <ErrorBox
          title="Gem data failed to load — colours and sources are unavailable:"
          errors={[profile.gemDataError, 'Reinstalling the overlay should fix this.']}
        />
      )}

      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] text-overlay-muted">
        <span className="text-overlay-text">{profile.meta.class}</span>
        {profile.meta.ascendancy && <span>· {profile.meta.ascendancy}</span>}
        {profile.level != null && <span>· level {profile.level}</span>}
      </div>
      {/* Per character, not per stage: it sits with the character line, above
          the stage navigation, so paging through stages never moves it. */}
      {profile.muleChoice && <MulePicker choice={profile.muleChoice} />}

      {/* Only fires across base classes now — an Elementalist on a Witch build
          is the same character, ascended. "an Assassin" needs its own article. */}
      {profile.classMismatch && (
        <div className="mb-2 rounded-md border border-warn/40 bg-warn/10 p-1.5 text-[10px] text-warn">
          <span aria-hidden>⚠ </span>Tracked character is {article(profile.classMismatch)} {profile.classMismatch}, but this profile is
          for a {profile.meta.class}. Wrong profile loaded?
        </div>
      )}
      {/* Turquoise like every "Mule" in this tab: it's the same plan, not a
          problem. And it says what happens next, so nobody goes looking for
          a button to switch back. */}
      {profile.muling && (
        <div className="mb-2 rounded-md border border-mule/30 bg-mule/10 p-1.5 text-[10px] text-mule">
          Muling on {article(profile.muling)} {profile.muling}? Stash its starting gems, then go back to your{' '}
          {profile.meta.class} — the overlay follows on its next level-up.
        </div>
      )}

      {/* Stage navigation sits ABOVE the acquisition list so it keeps a fixed
          position — a longer or shorter buy list must not move the controls. */}
      {stage &&
        (stageCount > 1 ? (
          <div className="mb-1 flex items-center gap-1 px-1">
            <button
              disabled={!canPrev}
              onClick={() => window.overlay?.stageStep(-1)}
              title="Previous stage"
              aria-label="Previous stage"
              className="shrink-0 rounded px-1 text-xs text-overlay-muted enabled:hover:text-overlay-text disabled:opacity-40"
            >
              ◀
            </button>
            <span className={'flex-1 truncate text-center ' + HEADING + 'text-overlay-muted'}>
              {stage.label}
            </span>
            <button
              disabled={!canNext}
              onClick={() => window.overlay?.stageStep(1)}
              title="Next stage"
              aria-label="Next stage"
              className="shrink-0 rounded px-1 text-xs text-overlay-muted enabled:hover:text-overlay-text disabled:opacity-40"
            >
              ▶
            </button>
          </div>
        ) : (
          <div className={'mb-1 px-1 ' + HEADING + 'text-overlay-muted'}>
            {stage.label}
          </div>
        ))}
      {stage && !onLiveStage && (
        <button
          onClick={() => window.overlay?.stageToLive()}
          title="Return to the stage for your current level"
          className="mb-1.5 flex w-full items-center justify-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] text-overlay-text hover:bg-white/15"
        >
          Viewing {viewedIndex < liveIndex ? 'an earlier' : 'a later'} stage
          {profile.level != null ? ` · you're level ${profile.level}` : ''} — ▸ jump to current
        </button>
      )}

      {/* One column system for the whole tab: cost, gem, source. Every list is a
          `subgrid` inside it, which is what makes the alignment structural
          instead of arithmetic — a box borrows these tracks, so its own border
          and padding move its outer edges without moving the shared column
          lines. Nesting them (the "pick one" box inside the plan box) stays
          aligned for the same reason. Anything that isn't a row spans all
          three. */}
      <div className="grid grid-cols-[4rem_1fr_6.5rem] items-baseline gap-x-1.5">
        {plan.length > 0 && (
          <div
            className={
              'col-span-3 mb-2 grid grid-cols-subgrid items-baseline gap-x-1.5 gap-y-1.5 rounded-md border p-2 ' +
              (atReward ? 'border-overlay-accent/50 bg-overlay-accent/10' : 'border-overlay-border/60 bg-black/20')
            }
          >
            <div
              className={
                'col-span-3 ' + HEADING +
                (atReward ? 'text-overlay-accent' : 'text-overlay-muted')
              }
            >
              Get these gems{atReward ? ' — take rewards now' : ''}
            </div>
            {/* Rows render bare cells into this grid, so the columns line up
                across every row. Dimming a "later" row happens per cell: a
                wrapper element here would become a grid item and break them. */}
            {plan.map((item, i) => {
              // A heading each time the shopping stop changes, so what you pick
              // up in one visit reads as one block. A vendor's stock grows with
              // each quest, so the same NPC can head two blocks — that's two
              // trips, not a duplicate.
              const stop = item.kind === 'buy' ? item.stop : undefined
              const prev = plan[i - 1]
              const prevStop = prev?.kind === 'buy' ? prev.stop : undefined
              return (
                <Fragment key={i}>
                  {/* No heading for the mule: the Mule picker right above says
                      it already, and a heading made the rewards after it read
                      as part of the mule trip. */}
                  {stop && stop.key !== 'mule' && stop.key !== prevStop?.key && (
                    <div
                      className={
                        'col-span-3 mt-0.5 ' + HEADING +
                        (stop.npc && !item.later ? sourceTone(sourceName(stop.npc)) : 'text-overlay-muted')
                      }
                    >
                      {stop.npc
                        ? [stop.act ? `A${stop.act}` : null, sourceName(stop.npc)]
                            .filter(Boolean)
                            .join(' · ')
                        : stop.label}
                    </div>
                  )}
                  {item.kind === 'reward' ? (
                    <RewardGroupRow
                      group={item.group}
                      comingUpAt={item.later ? item.atLevel : undefined}
                      later={item.later}
                    />
                  ) : (
                    <BuyRow
                      entry={item.entry}
                      comingUpAt={item.later ? item.atLevel : undefined}
                      later={item.later}
                    />
                  )}
                </Fragment>
              )
            })}
            {plan.some((it) => it.kind === 'buy' && it.entry.fallback) && (
              <p className="col-span-3 text-[10px] text-overlay-muted">
                ≈ general vendor: Siosa (Act 3, after the Library) / Lilly Roth (Act 6+) sell most
                gems; you may find it earlier as a quest reward.
              </p>
            )}
          </div>
        )}

        {stage ? (
          <>
            {stage.groups.map((group, i) => (
              <SocketGroup
                key={i}
                group={group}
                acq={acqByGem}
                marks={profile.acquisitions?.linkMarks ?? {}}
                fresh={freshGems}
              />
            ))}
            {stage.note && (
              <div className="col-span-3 mb-2 px-1 text-[10px] text-overlay-muted">{stage.note}</div>
            )}
          </>
        ) : (
          <p className="col-span-3 px-1 text-xs text-overlay-muted">No stage for the current level.</p>
        )}
      </div>

      {profile.nextStage && (
        <div className="mt-2 px-1 text-[10px] text-overlay-muted">
          From level {profile.nextStage.range[0]}: {profile.nextStage.label}
        </div>
      )}
    </>
  )
}
