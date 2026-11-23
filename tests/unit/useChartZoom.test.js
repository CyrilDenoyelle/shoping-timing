import { describe, it, expect, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { DAY } from '@/utils/time.js'
import { useChartZoom } from '@/composables/useChartZoom.js'

const FULL = { min: 0, max: 200 * DAY }
// Zone de tracé de 400 px à partir de x = 100
const AREA = { left: 100, width: 400 }

function setup(full = FULL, area = AREA) {
  return useChartZoom(full, () => area)
}

const wheel = (overrides = {}) => ({
  ctrlKey: true,
  metaKey: false,
  deltaY: -100,
  deltaMode: 0,
  clientX: 300,
  preventDefault: vi.fn(),
  ...overrides,
})

const pointer = (id, clientX, overrides = {}) => ({
  pointerId: id,
  pointerType: 'touch',
  button: 0,
  clientX,
  currentTarget: { setPointerCapture: vi.fn() },
  ...overrides,
})

describe('useChartZoom', () => {
  describe('buttons', () => {
    it('starts on the full range, not zoomed', () => {
      const zoom = setup()
      expect(zoom.range.value).toEqual(FULL)
      expect(zoom.zoomed.value).toBe(false)
      expect(zoom.canZoomOut.value).toBe(false)
      expect(zoom.canZoomIn.value).toBe(true)
    })

    it('zooms in around the center then back out to the full range', () => {
      const zoom = setup()
      zoom.zoomIn()
      expect(zoom.zoomed.value).toBe(true)
      expect(zoom.range.value.max - zoom.range.value.min).toBeCloseTo((200 * DAY) / 1.6, 3)
      const center = (zoom.range.value.min + zoom.range.value.max) / 2
      expect(center).toBeCloseTo(100 * DAY, 3)
      zoom.zoomOut()
      expect(zoom.zoomed.value).toBe(false)
      expect(zoom.range.value).toEqual(FULL)
    })

    it('stops zooming in at the tightest view', () => {
      const zoom = setup()
      for (let i = 0; i < 30; i++) zoom.zoomIn()
      expect(zoom.range.value.max - zoom.range.value.min).toBe(10 * DAY)
      expect(zoom.canZoomIn.value).toBe(false)
      const before = { ...zoom.range.value }
      zoom.zoomIn()
      expect(zoom.range.value).toEqual(before)
    })

    it('resets to the full range', () => {
      const zoom = setup()
      zoom.zoomIn()
      zoom.zoomIn()
      zoom.reset()
      expect(zoom.zoomed.value).toBe(false)
      expect(zoom.range.value).toEqual(FULL)
    })

    it('keeps each instance independent', () => {
      const a = setup()
      const b = setup()
      a.zoomIn()
      expect(a.zoomed.value).toBe(true)
      expect(b.zoomed.value).toBe(false)
    })
  })

  describe('data changes', () => {
    it('returns to the full view when the full range changes', async () => {
      const full = ref({ ...FULL })
      const zoom = setup(full)
      zoom.zoomIn()
      expect(zoom.zoomed.value).toBe(true)
      full.value = { min: 0, max: 260 * DAY }
      await nextTick()
      expect(zoom.zoomed.value).toBe(false)
      expect(zoom.range.value).toEqual({ min: 0, max: 260 * DAY })
    })
  })

  describe('wheel', () => {
    it('leaves the page scroll alone without a modifier key', () => {
      const zoom = setup()
      const event = wheel({ ctrlKey: false })
      zoom.onWheel(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(zoom.zoomed.value).toBe(false)
    })

    it('zooms in with Ctrl + wheel up and out with wheel down', () => {
      const zoom = setup()
      const event = wheel()
      zoom.onWheel(event)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(zoom.zoomed.value).toBe(true)
      zoom.onWheel(wheel({ deltaY: 100 }))
      expect(zoom.zoomed.value).toBe(false)
    })

    it('accepts Cmd on macOS', () => {
      const zoom = setup()
      zoom.onWheel(wheel({ ctrlKey: false, metaKey: true }))
      expect(zoom.zoomed.value).toBe(true)
    })

    it('keeps the instant under the cursor in place', () => {
      const zoom = setup()
      // Curseur à 25 % de la zone de tracé : x = 100 + 0,25 × 400 = 200
      zoom.onWheel(wheel({ clientX: 200 }))
      const { min, max } = zoom.range.value
      const instantUnderCursor = min + 0.25 * (max - min)
      expect(instantUnderCursor).toBeCloseTo(50 * DAY, 3)
    })

    it('treats line-based wheel deltas as larger steps', () => {
      const pixels = setup()
      const lines = setup()
      pixels.onWheel(wheel({ deltaY: -3 }))
      lines.onWheel(wheel({ deltaY: -3, deltaMode: 1 }))
      const span = (z) => z.range.value.max - z.range.value.min
      expect(span(lines)).toBeLessThan(span(pixels))
    })
  })

  describe('drag', () => {
    function zoomedInstance() {
      const zoom = setup()
      zoom.zoomIn()
      zoom.zoomIn()
      return zoom
    }

    it('pans the view with a single pointer, dragging right moves back in time', () => {
      const zoom = zoomedInstance()
      const start = { ...zoom.range.value }
      const span = start.max - start.min
      zoom.onPointerDown(pointer(1, 300))
      zoom.onPointerMove(pointer(1, 340))
      // 40 px sur 400 px = 10 % de la durée affichée
      expect(zoom.range.value.min).toBeCloseTo(start.min - 0.1 * span, 3)
      expect(zoom.range.value.max - zoom.range.value.min).toBeCloseTo(span, 3)
      zoom.onPointerUp(pointer(1, 340))
      zoom.onPointerMove(pointer(1, 400))
      expect(zoom.range.value.min).toBeCloseTo(start.min - 0.1 * span, 3)
    })

    it('stays inside the full range while dragging', () => {
      const zoom = zoomedInstance()
      zoom.onPointerDown(pointer(1, 300))
      zoom.onPointerMove(pointer(1, 20000))
      expect(zoom.range.value.min).toBe(0)
      zoom.onPointerMove(pointer(1, -20000))
      expect(zoom.range.value.max).toBe(200 * DAY)
    })

    it('does nothing at full range', () => {
      const zoom = setup()
      zoom.onPointerDown(pointer(1, 300))
      zoom.onPointerMove(pointer(1, 360))
      expect(zoom.zoomed.value).toBe(false)
    })

    it('ignores the right mouse button', () => {
      const zoom = zoomedInstance()
      const before = { ...zoom.range.value }
      zoom.onPointerDown(pointer(1, 300, { pointerType: 'mouse', button: 2 }))
      zoom.onPointerMove(pointer(1, 360, { pointerType: 'mouse' }))
      expect(zoom.range.value).toEqual(before)
    })

    it('survives a pointer capture failure', () => {
      const zoom = zoomedInstance()
      const event = pointer(1, 300)
      event.currentTarget.setPointerCapture = () => {
        throw new Error('InvalidPointerId')
      }
      expect(() => zoom.onPointerDown(event)).not.toThrow()
      const before = zoom.range.value.min
      zoom.onPointerMove(pointer(1, 340))
      expect(zoom.range.value.min).toBeLessThan(before)
    })
  })

  describe('pinch', () => {
    it('zooms in when two pointers move apart', () => {
      const zoom = setup()
      zoom.onPointerDown(pointer(1, 250))
      zoom.onPointerDown(pointer(2, 350))
      zoom.onPointerMove(pointer(1, 200))
      zoom.onPointerMove(pointer(2, 400))
      expect(zoom.zoomed.value).toBe(true)
    })

    it('zooms out when two pointers come closer', () => {
      const zoom = setup()
      zoom.zoomIn()
      zoom.zoomIn()
      const before = zoom.range.value.max - zoom.range.value.min
      zoom.onPointerDown(pointer(1, 200))
      zoom.onPointerDown(pointer(2, 400))
      zoom.onPointerMove(pointer(1, 250))
      zoom.onPointerMove(pointer(2, 350))
      expect(zoom.range.value.max - zoom.range.value.min).toBeGreaterThan(before)
    })

    it('keeps the instant between the fingers under them when they move together', () => {
      const zoom = setup()
      zoom.zoomIn()
      zoom.zoomIn()
      zoom.onPointerDown(pointer(1, 250))
      zoom.onPointerDown(pointer(2, 350))
      const { min, max } = zoom.range.value
      const instant = min + ((300 - AREA.left) / AREA.width) * (max - min)
      // Les deux doigts glissent de 100 px vers la droite par pas de 10 px, sans changer d'écart
      for (let step = 1; step <= 10; step++) {
        zoom.onPointerMove(pointer(1, 250 + step * 10))
        zoom.onPointerMove(pointer(2, 350 + step * 10))
      }
      const after = zoom.range.value
      const instantAfter = after.min + ((400 - AREA.left) / AREA.width) * (after.max - after.min)
      expect(instantAfter).toBeCloseTo(instant, 0)
    })

    it('goes back to single-pointer panning when one finger lifts', () => {
      const zoom = setup()
      zoom.zoomIn()
      zoom.zoomIn()
      zoom.onPointerDown(pointer(1, 250))
      zoom.onPointerDown(pointer(2, 350))
      zoom.onPointerUp(pointer(2, 350))
      const before = zoom.range.value.min
      zoom.onPointerMove(pointer(1, 290))
      expect(zoom.range.value.min).toBeLessThan(before)
    })
  })

  describe('missing plot area', () => {
    it('keeps buttons working and ignores gestures that need pixels', () => {
      const zoom = useChartZoom(FULL, () => null)
      zoom.onPointerDown(pointer(1, 300))
      zoom.onPointerMove(pointer(1, 360))
      expect(zoom.zoomed.value).toBe(false)
      zoom.onWheel(wheel())
      expect(zoom.zoomed.value).toBe(true)
      zoom.reset()
      zoom.zoomIn()
      expect(zoom.zoomed.value).toBe(true)
    })
  })
})
