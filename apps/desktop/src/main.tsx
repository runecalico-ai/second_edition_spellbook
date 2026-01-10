import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './ui/App'
import Library from './ui/Library'
import ImportWizard from './ui/ImportWizard'
import Chat from './ui/Chat'
import ExportPage from './ui/ExportPage'
import SpellEditor from './ui/SpellEditor'
import Spellbook from './ui/Spellbook'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Library /> },
      { path: 'spellbook', element: <Spellbook /> },
      { path: 'import', element: <ImportWizard /> },
      { path: 'chat', element: <Chat /> },
      { path: 'export', element: <ExportPage /> },
      { path: 'spell/new', element: <SpellEditor /> },
      { path: 'spell/:id', element: <SpellEditor /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
