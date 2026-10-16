import { Box, Text } from 'ink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useThemeColors } from '../theme'
import { CodeBlock } from './code-block'
import { type MarkdownToken, StreamingMarkdownParser } from './markdown-parser'

/** StreamingMarkdown component - renders markdown as it streams in */
interface StreamingMarkdownProps {
  content: string
  onTokensChange?: (tokens: MarkdownToken[]) => void
}

export function StreamingMarkdown({ content, onTokensChange }: StreamingMarkdownProps) {
  const colors = useThemeColors()
  const parserRef = useRef<StreamingMarkdownParser>(new StreamingMarkdownParser())
  const [tokens, setTokens] = useState<MarkdownToken[]>([])
  const isFirstRender = useRef(true)

  // Process new content
  useEffect(() => {
    if (!content) return

    const newTokens = parserRef.current.processChunk(content)
    if (newTokens.length > 0) {
      const allTokens = parserRef.current.getTokens()
      setTokens(allTokens)
      onTokensChange?.(allTokens)
    }
  }, [content, onTokensChange])

  // Reset when content is empty (new message)
  useEffect(() => {
    if (content === '' && isFirstRender.current) {
      parserRef.current.reset()
      setTokens([])
      isFirstRender.current = false
    } else if (content) {
      isFirstRender.current = true
    }
  }, [content])

  const renderToken = useCallback(
    (token: MarkdownToken, index: number) => {
      switch (token.type) {
        case 'header':
          return (
            <Box key={index} marginTop={1} marginBottom={0}>
              <Box flexDirection="row">
                <Text color={colors.primary} bold>
                  {'#'.repeat(token.meta?.level || 1)}{' '}
                </Text>
                <Text color={colors.textPrimary} bold>
                  {token.content}
                </Text>
              </Box>
            </Box>
          )

        case 'code_block': {
          const language = token.meta?.language || 'text'
          return (
            <CodeBlock key={index} code={token.content} language={language} themeColors={colors} />
          )
        }

        case 'code_inline':
          return (
            <Box key={index} flexDirection="row">
              <Box
                // @ts-ignore - backgroundColor works at runtime
                backgroundColor={colors.surfaceElevated}
                // @ts-ignore - paddingLeft works at runtime
                paddingLeft={1}
                // @ts-ignore - paddingRight works at runtime
                paddingRight={1}
              >
                <Text color={colors.accent}>{token.content}</Text>
              </Box>
            </Box>
          )

        case 'bold':
          return (
            <Text key={index} bold color={colors.textPrimary}>
              {token.content}
            </Text>
          )

        case 'italic':
          return (
            <Text key={index} italic color={colors.textPrimary}>
              {token.content}
            </Text>
          )

        case 'strikethrough':
          return (
            <Text key={index} strikethrough color={colors.textSecondary}>
              {token.content}
            </Text>
          )

        case 'link':
          return (
            <Box key={index} flexDirection="row">
              <Text color={colors.primary} underline>
                {token.content}
              </Text>
              <Box marginLeft={1}>
                <Text color={colors.textMuted}>({token.meta?.href})</Text>
              </Box>
            </Box>
          )

        case 'list_item':
          return (
            <Box key={index} marginLeft={2 + (token.meta?.index || 0) * 2} flexDirection="row">
              <Box marginRight={1}>
                <Text color={colors.primary}>
                  {token.meta?.ordered ? `${token.meta?.index || 1}.` : '•'}
                </Text>
              </Box>
              <Text color={colors.textPrimary}>{token.content}</Text>
            </Box>
          )

        case 'blockquote':
          return (
            <Box
              key={index}
              marginLeft={2}
              borderLeft
              borderLeftColor={colors.border}
              paddingLeft={1}
            >
              <Text color={colors.textSecondary} italic>
                {token.content}
              </Text>
            </Box>
          )

        case 'horizontal_rule':
          return (
            <Text key={index} color={colors.border}>
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </Text>
          )

        case 'text':
        default:
          return (
            <Text key={index} color={colors.textPrimary}>
              {token.content}
            </Text>
          )
      }
    },
    [colors],
  )

  // Render pending content if parser is in incomplete state
  const pendingContent = parserRef.current.getPendingContent()
  const showPending = pendingContent && parserRef.current.isInCodeBlock()

  return (
    <Box flexDirection="column">
      {tokens.map(renderToken)}
      {showPending && (
        <CodeBlock
          code={pendingContent.replace(/^```\w*\n/, '')}
          language={parserRef.current['state'].codeBlockLanguage || 'text'}
          themeColors={colors}
          isIncomplete={true}
        />
      )}
    </Box>
  )
}

/** Simpler markdown renderer for complete content */
export function Markdown({ content }: { content: string }) {
  const colors = useThemeColors()
  const parser = useMemo(() => new StreamingMarkdownParser(), [])

  // Parse all at once
  parser.processChunk(content)
  parser.processChunk('') // flush

  return (
    <Box flexDirection="column">
      {parser.getTokens().map((token, index) => {
        switch (token.type) {
          case 'header':
            return (
              <Box key={index} marginTop={1} marginBottom={0}>
                <Box flexDirection="row">
                  <Text color={colors.primary} bold>
                    {'#'.repeat(token.meta?.level || 1)}{' '}
                  </Text>
                  <Text color={colors.textPrimary} bold>
                    {token.content}
                  </Text>
                </Box>
              </Box>
            )
          case 'code_block':
            return (
              <CodeBlock
                key={index}
                code={token.content}
                language={token.meta?.language || 'text'}
                themeColors={colors}
              />
            )
          case 'code_inline':
            return (
              <Box key={index} flexDirection="row">
                <Box
                  // @ts-ignore - backgroundColor works at runtime
                  backgroundColor={colors.surfaceElevated}
                  // @ts-ignore - paddingLeft works at runtime
                  paddingLeft={1}
                  // @ts-ignore - paddingRight works at runtime
                  paddingRight={1}
                >
                  <Text color={colors.accent}>{token.content}</Text>
                </Box>
              </Box>
            )
          case 'bold':
            return (
              <Text key={index} bold color={colors.textPrimary}>
                {token.content}
              </Text>
            )
          case 'italic':
            return (
              <Text key={index} italic color={colors.textPrimary}>
                {token.content}
              </Text>
            )
          case 'strikethrough':
            return (
              <Text key={index} strikethrough color={colors.textSecondary}>
                {token.content}
              </Text>
            )
          case 'link':
            return (
              <Box key={index} flexDirection="row">
                <Text color={colors.primary} underline>
                  {token.content}
                </Text>
                <Box marginLeft={1}>
                  <Text color={colors.textMuted}>({token.meta?.href})</Text>
                </Box>
              </Box>
            )
          case 'list_item':
            return (
              <Box key={index} marginLeft={2 + (token.meta?.index || 0) * 2} flexDirection="row">
                <Box marginRight={1}>
                  <Text color={colors.primary}>
                    {token.meta?.ordered ? `${token.meta?.index || 1}.` : '•'}
                  </Text>
                </Box>
                <Text color={colors.textPrimary}>{token.content}</Text>
              </Box>
            )
          case 'blockquote':
            return (
              <Box
                key={index}
                marginLeft={2}
                borderLeft
                borderLeftColor={colors.border}
                paddingLeft={1}
              >
                <Text color={colors.textSecondary} italic>
                  {token.content}
                </Text>
              </Box>
            )
          case 'horizontal_rule':
            return (
              <Text key={index} color={colors.border}>
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━
              </Text>
            )
          case 'text':
          default:
            return (
              <Text key={index} color={colors.textPrimary}>
                {token.content}
              </Text>
            )
        }
      })}
    </Box>
  )
}
