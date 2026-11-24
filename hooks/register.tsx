import type { EngineInterface, Register } from 'claude-code'

import { barState, ISSUES_PANE, noteSession, onFinished, registerIssues, registerLead } from './issues'
import { barSvg, GREY, pipelineAlt, pipelineSvg, ringSvg, TONE } from './look'
import { spriteSvg } from './sprites'
import { initAgentsPanel, noteTurnComplete, registerAgentsPanel } from './agents-panel'
import { config, setConfig } from './config'
import { TONIR_TITLE } from './ids'

// Opens the one pane; true when a surface draws it now.
async function openTonir($: EngineInterface): Promise<boolean> {
  return (await $.ui.open({ id: ISSUES_PANE, title: TONIR_TITLE })).isPlaced
}

export const register: Register = (on, options) => {
  setConfig(options)
  registerIssues(on, {})
  registerAgentsPanel(on, {})

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tonir',
      description: 'Open the Tonir pane: issues, builds and agents',
    })
    await $.command.register({
      name: 'tonir-default-look',
      description: 'Clear a theme an earlier Tonir version set in this session',
    })
    await initAgentsPanel($)
    await registerLead($)
    await noteSession($, e.cwd)
    // The desktop app usually attaches after this; session.attach shows it then.
    await openTonir($)

    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      if (!(await openTonir($))) {
        $.ui.toast(`Tonir: the Issues pane has no place to draw on ${e.surface}`)
      }
    }

    return attached
  })

  on('turn.complete', async ($, e, next) => {
    await noteTurnComplete($, e)

    if (e.agentId !== undefined) {
      await onFinished($, e.agentId, e.reason === 'answer')
    }

    return next(e)
  })

  on('command.run', { command: 'tonir' }, async $ => {
    const isPlaced = await openTonir($)

    return { text: `Tonir: ${isPlaced ? 'placed' : 'not placed'}` }
  })

  // Only on request, never at start, attach or reload: a clear there is refused by the API.
  on('command.run', { command: 'tonir-default-look' }, async $ => {
    const cleared = await $.theme.clear()

    return {
      text: cleared.isDrawn ? 'Default look restored.' : 'Default look restored: ' + (cleared.reason ?? 'no theme was set'),
    }
  })

  // Right-click: one row.
  on('ui.render', { component: 'ContextMenu' }, ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Button key="open-tonir" label="Open Tonir" onPress={() => openTonir($)} />
      </Box>
    )
  })

  // The one row above the prompt, only when the person turned it on. The app's own rows are never touched.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (config().openBar !== 'on') return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const state = await barState($)
    const columns = e.props.bodyColumns ?? 80
    // Narrow: the title goes first, then the pipeline.
    const showTitle = columns >= 80
    const showBars = columns >= 50
    // The pipeline is the pane's: the same helper, the same colours.
    const PIPE_W = 96

    return (
      // The app already frames the rows above the prompt: no border, fill or height of our own.
      <Box flexDirection="row" alignItems="center" gap={1.5}>
        {state.building === null && state.agent !== null ? (
          // No issue builds, an agent runs: the pane's agent row in one line, with the same sprite and bar.
          <Box key="agent" flexDirection="row" alignItems="center" gap={1.5}>
            {Svg !== undefined && showBars && (
              <Svg key="sprite" source={spriteSvg(16, state.agent.kind, true)} alt={`${state.agent.kind} sprite`} width={16} height={16} />
            )}
            <Box key="title" width={showTitle ? 32 : 16} overflow="hidden">
              <Text wrap="truncate-end">{state.agent.title}</Text>
            </Box>
            <Text key="step" dimColor>
              {state.agent.step}
            </Text>
            {Svg !== undefined && showBars && (
              <Svg
                key="bar"
                source={barSvg(PIPE_W, state.agent.ratio, state.agent.color)}
                alt={`${state.agent.title}: running`}
                width={PIPE_W}
                height={4}
              />
            )}
            {state.agent.more > 0 && (
              <Text key="more" dimColor>
                {`+${state.agent.more}`}
              </Text>
            )}
          </Box>
        ) : state.building === null && state.session !== null ? (
          // Nothing runs: the pane's first issue of this session, as its row reads.
          <Box key="session" flexDirection="row" alignItems="center" gap={1}>
            {Svg !== undefined && showBars && <Svg key="ring" source={ringSvg(GREY)} alt={`#${state.session.number}`} width={16} height={16} />}
            <Text key="num" mono dimColor>
              {`#${state.session.number}`}
            </Text>
            <Box key="title" width={showTitle ? 32 : 16} overflow="hidden">
              <Text wrap="truncate-end">{state.session.title}</Text>
            </Box>
            {state.session.word !== '' && (
              <Text key="word" color={state.session.tone}>
                {state.session.word}
              </Text>
            )}
          </Box>
        ) : state.building === null ? (
          <Text key="repo" dimColor>
            {state.repo}
          </Text>
        ) : (
          <Box key="building" flexDirection="row" alignItems="center" gap={1.5}>
            {Svg !== undefined && showBars && (
              <Svg key="sprite" source={spriteSvg(16, state.building.kind, true)} alt={`${state.building.kind} sprite`} width={16} height={16} />
            )}
            <Text key="num" mono dimColor>
              {`#${state.building.number}`}
            </Text>
            {showTitle && (
              <Box key="title" width={32} overflow="hidden">
                <Text wrap="truncate-end">{state.building.title}</Text>
              </Box>
            )}
            {showBars &&
              (Svg === undefined ? (
                <Text key="pipeline" color={TONE.busy}>
                  {'▬'.repeat(state.building.idx + 1)}
                </Text>
              ) : (
                <Svg
                  key="pipeline"
                  source={pipelineSvg(PIPE_W, state.building.idx)}
                  alt={pipelineAlt(state.building.idx, state.building.stage)}
                  width={PIPE_W}
                  height={4}
                />
              ))}
            <Text key="stage" color={TONE.busy}>
              {state.building.stage}
            </Text>
          </Box>
        )}
        <Box flexGrow={1} />
        {/* One pane, one button. */}
        <Button key="bar-open" plain dimColor label="Open Tonir" onPress={() => openTonir($)} />
      </Box>
    )
  })
}
