import 'ink'
import type { CSSProperties } from 'react'

declare module 'ink' {
  interface BoxProps {
    style?: CSSProperties
  }
  interface TextProps {
    style?: CSSProperties
    weight?: 'bold' | 'normal'
    marginLeft?: number
    marginRight?: number
    marginTop?: number
    marginBottom?: number
    marginX?: number
    marginY?: number
    paddingLeft?: number
    paddingRight?: number
    paddingTop?: number
    paddingBottom?: number
    paddingX?: number
    paddingY?: number
    flexGrow?: number
    flexShrink?: number
    flexBasis?: number | string
    width?: number | string
    height?: number | string
    backgroundColor?: string
    color?: string
    borderWidth?: number
    borderColor?: string
    borderRadius?: number
    border?: string
    position?: 'absolute' | 'relative'
    top?: number
    right?: number
    bottom?: number
    left?: number
    zIndex?: number
    overflowY?: 'auto' | 'hidden' | 'visible' | 'scroll'
    alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
    justifyContent?:
      | 'flex-start'
      | 'flex-end'
      | 'center'
      | 'space-between'
      | 'space-around'
      | 'space-evenly'
    flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
    flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse'
    alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
    alignContent?:
      | 'flex-start'
      | 'flex-end'
      | 'center'
      | 'space-between'
      | 'space-around'
      | 'stretch'
  }
}
