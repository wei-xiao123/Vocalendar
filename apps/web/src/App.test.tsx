import { render, screen } from '@testing-library/react'

import App from './App'

it('renders the project foundation shell', () => {
  render(<App />)

  expect(
    screen.getByRole('heading', { name: /voice-first calendar assistant/i }),
  ).toBeInTheDocument()
  expect(screen.getByText(/React \+ Vite \+ Tailwind CSS/)).toBeInTheDocument()
  expect(screen.getByText(/FastAPI \+ SQLAlchemy \+ Alembic/)).toBeInTheDocument()
})
