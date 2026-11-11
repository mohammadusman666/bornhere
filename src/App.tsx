import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Gift } from './pages/Gift'
import { Home } from './pages/Home'
import { Story } from './pages/Story'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gift" element={<Gift />} />
        <Route path="/story/:date/:city" element={<Story />} />
      </Routes>
    </BrowserRouter>
  )
}
