import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import Login from './pages/Login';
import News from './pages/News';
import Contact from './pages/Contact';

function App() {
  return (
    <Router>
      <div style={{ backgroundColor: '#fff', minHeight: '100vh' }}>
        <header style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', color: '#007BFF', fontSize: '24px', fontWeight: 'bold' }}>
            Whee Music Academy
          </Link>
          <nav>
            <Link to="/about" style={{ marginLeft: '20px', textDecoration: 'none', color: '#000', fontSize: '16px' }}>ABOUT US</Link>
            <Link to="/login" style={{ marginLeft: '20px', textDecoration: 'none', color: '#000', fontSize: '16px' }}>LOGIN</Link>
            <Link to="/news" style={{ marginLeft: '20px', textDecoration: 'none', color: '#000', fontSize: '16px' }}>NEWS</Link>
            <Link to="/contact" style={{ marginLeft: '20px', textDecoration: 'none', color: '#000', fontSize: '16px' }}>CONTACT</Link>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/news" element={<News />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;