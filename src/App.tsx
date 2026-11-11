import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { Story } from './pages/Story'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/story/:date/:city" element={<Story />} />
      </Routes>
    </BrowserRouter>
  )
}
