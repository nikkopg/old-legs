import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { NewspaperChrome, Paper } from '@/components/redesign/NewspaperChrome'

const nav = [
  { key: 'dashboard', label: 'Front Page' },
  { key: 'activities', label: 'Dispatches' },
]

describe('NewspaperChrome', () => {
  it('renders "Old Legs" masthead text', () => {
    render(<NewspaperChrome section="Dispatches" />)
    expect(screen.getByText('Old Legs')).toBeDefined()
  })

  it('renders the section prop string', () => {
    render(<NewspaperChrome section="Front Page · Weekly Edition" />)
    expect(screen.getByText(/Front Page · Weekly Edition/)).toBeDefined()
  })

  it('renders nav items when nav prop is provided', () => {
    render(<NewspaperChrome section="Test" nav={nav} activeNav="dashboard" />)
    expect(screen.getByText('Front Page')).toBeDefined()
    expect(screen.getByText('Dispatches')).toBeDefined()
  })

  it('active nav item has fontWeight 800', () => {
    render(<NewspaperChrome section="Test" nav={nav} activeNav="dashboard" />)
    const activeLink = screen.getByText('Front Page').closest('a')
    expect(activeLink?.style.fontWeight).toBe('800')
  })

  it('inactive nav item has fontWeight 500', () => {
    render(<NewspaperChrome section="Test" nav={nav} activeNav="dashboard" />)
    const inactiveLink = screen.getByText('Dispatches').closest('a')
    expect(inactiveLink?.style.fontWeight).toBe('500')
  })

  it('calls onNav with correct key when nav item is clicked', async () => {
    const user = userEvent.setup()
    const onNav = vi.fn()
    render(<NewspaperChrome section="Test" nav={nav} activeNav="dashboard" onNav={onNav} />)
    await user.click(screen.getByText('Dispatches'))
    expect(onNav).toHaveBeenCalledWith('activities')
  })

  it('shows default subtitle when subtitle is undefined', () => {
    render(<NewspaperChrome section="Test" />)
    expect(screen.getByText(/No Cheerleading Since 1976/)).toBeDefined()
  })

  it('hides subtitle when subtitle is null', () => {
    render(<NewspaperChrome section="Test" subtitle={null} />)
    expect(screen.queryByText(/No Cheerleading Since 1976/)).toBeNull()
  })

  it('renders custom subtitle string when provided', () => {
    render(<NewspaperChrome section="Test" subtitle="Custom Sub" />)
    expect(screen.getByText('Custom Sub')).toBeDefined()
  })
})

describe('Paper', () => {
  it('renders its children', () => {
    render(<Paper><span>Paper content</span></Paper>)
    expect(screen.getByText('Paper content')).toBeDefined()
  })
})
