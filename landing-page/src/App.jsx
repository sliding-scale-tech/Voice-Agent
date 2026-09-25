import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import ScrollManager from './components/ScrollManager'
import Interactions from './interactions/Interactions'
import { ROUTES } from './config/site'
import Home from './pages/Home'

// Code-split /demo (perf agent): the call-demo widget's script/checklist data and DOM-manipulation
// effect have no reason to ship in the bundle Home's visitors download. Home stays a static import
// so `/` keeps its synchronous, zero-waterfall render.
const Demo = lazy(() => import('./pages/Demo'))

// Navbar is shared (identical markup/classes on both pages in the source). Everything else is
// per-page: Home renders its own <main> + <Footer/> (the source has a footer only on index.html);
// Demo renders its own self-contained <main class="hero" id="demo"> with NO footer, matching
// demo.html exactly — see src/pages/Demo.jsx.
export default function App() {
  return (
    <>
      <ScrollManager />
      <Interactions />
      <Navbar />
      <Suspense fallback={null}>
        <Routes>
          <Route path={ROUTES.home} element={<Home />} />
          <Route path={ROUTES.demo} element={<Demo />} />
        </Routes>
      </Suspense>
    </>
  )
}
