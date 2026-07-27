import { useEffect, useRef, useState } from 'react'

interface Props {
  orientation: 'vertical' | 'horizontal'
  onDrag: (e: MouseEvent) => void
}

/**
 * A thin draggable divider. "vertical" is a vertical bar you drag left/right
 * (for resizing side-by-side panes); "horizontal" is a bar you drag up/down.
 */
export default function Resizer({ orientation, onDrag }: Props) {
  const [dragging, setDragging] = useState(false)
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      e.preventDefault()
      onDragRef.current(e)
    }
    const up = () => setDragging(false)
    const cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize'
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragging, orientation])

  return (
    <div
      className={`resizer resizer-${orientation} ${dragging ? 'dragging' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
    />
  )
}
