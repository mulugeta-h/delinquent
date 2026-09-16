import './App.css';
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';

import { UserContext } from './context/UserContext';
import { getUserFromToken } from './api/authApi';

// Public pages
import Login from './pages/Login';            // ← this is the LANDING page too
import ChangePassword from './pages/ChangePassword';
import SessionManager from './components/SessionManager';
import PublicSearch from './pages/Search';    // ← public search page

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminHarmonization from './pages/List';
import AdminRecipts from './pages/Search';

// Super Admin Pages
import SuperDashboard from './pages/superAdmin/SuperDashboard';
import SuperAdminAdmin from './pages/superAdmin/Admin';
import SuperAdminHarmonization from './pages/List';
import SuperAdminRecipts from './pages/Search';

// Layout Components
import DashboardLayout from './components/layout/DashboardLayout';

// Icons
import DashboardIcon from "@mui/icons-material/Dashboard";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SearchIcon from "@mui/icons-material/Search";
import ListAltIcon from "@mui/icons-material/ListAlt";
import LogoutIcon from "@mui/icons-material/Logout";

const theme = createTheme({
  palette: {
    primary: { main: '#DAA520' },
    secondary: { main: '#000000' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiButton: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
    },
  },
});

const commonMenuItems = [
  { name: "Search", path: "/search", icon: <SearchIcon /> },
  { name: "List", path: "/list", icon: <ListAltIcon /> },
  { name: "Logout", path: "/logout", icon: <LogoutIcon />, isLogout: true },
];

const roleMenuConfig = {
  SUPER_ADMIN: [
    { name: "Dashboard", path: "/superDashboard", icon: <DashboardIcon /> },
    { name: "Admins", path: "/admin", icon: <AdminPanelSettingsIcon /> },
  ],
  ADMIN: [
    { name: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
  ],
};

const getMenuByRole = (role) => {
  const roleSpecific = roleMenuConfig[role] || roleMenuConfig.ADMIN;
  return [...roleSpecific, ...commonMenuItems];
};

const getTitleByRole = (role) => {
  const titles = {
    SUPER_ADMIN: "Super Admin Dashboard",
    ADMIN: "Admin Dashboard",
  };
  return titles[role] || "Dashboard";
};

const getDefaultRoute = (role) => {
  const routes = {
    SUPER_ADMIN: "/superDashboard",
    ADMIN: "/dashboard",
  };
  return routes[role] || "/dashboard";
};

const PrivateRoute = ({ children, allowedRoles = null, allowPasswordChange = false }) => {
  const { user } = React.useContext(UserContext);

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDefaultRoute(user.role)} replace />;
  }

  if (!allowPasswordChange && user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
};

const RoleBasedRoute = ({ children, allowedRoles }) => (
  <PrivateRoute allowedRoles={allowedRoles}>
    {children}
  </PrivateRoute>
);

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    const parsed = saved ? JSON.parse(saved) : null;
    const tokenUser = getUserFromToken();
    if (parsed && tokenUser?.mustChangePassword) {
      parsed.mustChangePassword = true;
    }
    return parsed;
  });
  const isMobile = useMediaQuery('(max-width:900px)');

  useEffect(() => {
    if (!user) {
      localStorage.removeItem("user");
      return;
    }

    localStorage.setItem("user", JSON.stringify(user));

    try {
      const token = user.token;
      if (!token) {
        setUser(null);
        return;
      }
      const payload = JSON.parse(atob(token.split(".")[1]));
      const expired = payload.exp * 1000 < Date.now();
      if (expired) {
        localStorage.removeItem("user");
        setUser(null);
      }
    } catch (err) {
      localStorage.removeItem("user");
      setUser(null);
    }
  }, [user]);

  const userContextValue = React.useMemo(() => ({ user, setUser }), [user]);

  // ============================================================
  // AUTHENTICATED
  // ============================================================
  if (user) {
    const userRole = user.role || 'ADMIN';
    const currentMenu = getMenuByRole(userRole);
    const dashboardTitle = getTitleByRole(userRole);

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <UserContext.Provider value={userContextValue}>
            <SessionManager>
              <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="colored"
                limit={3}
              />
              <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />
                <Route
                  path="/change-password"
                  element={
                    <PrivateRoute allowPasswordChange>
                      <ChangePassword />
                    </PrivateRoute>
                  }
                />

                {/* Main dashboard layout */}
                <Route
                  path="/"
                  element={
                    <DashboardLayout
                      menu={currentMenu}
                      title={dashboardTitle}
                      isMobile={isMobile}
                    />
                  }
                >
                  <Route
                    index
                    element={<Navigate to={getDefaultRoute(userRole)} replace />}
                  />

                  {/* SUPER_ADMIN */}
                  <Route
                    path="superDashboard"
                    element={
                      <RoleBasedRoute allowedRoles={['SUPER_ADMIN']}>
                        <SuperDashboard />
                      </RoleBasedRoute>
                    }
                  />
                  <Route
                    path="admin"
                    element={
                      <RoleBasedRoute allowedRoles={['SUPER_ADMIN']}>
                        <SuperAdminAdmin />
                      </RoleBasedRoute>
                    }
                  />

                  {/* ADMIN */}
                  <Route
                    path="dashboard"
                    element={
                      <RoleBasedRoute allowedRoles={['ADMIN']}>
                        <AdminDashboard />
                      </RoleBasedRoute>
                    }
                  />

                  {/* SEARCH */}
                  <Route
                    path="search"
                    element={
                      <PrivateRoute>
                        {userRole === 'SUPER_ADMIN' ? (
                          <SuperAdminRecipts />
                        ) : (
                          <AdminRecipts />
                        )}
                      </PrivateRoute>
                    }
                  />

                  {/* LIST */}
                  <Route
                    path="list"
                    element={
                      <PrivateRoute>
                        {userRole === 'SUPER_ADMIN' ? (
                          <SuperAdminHarmonization />
                        ) : (
                          <AdminHarmonization />
                        )}
                      </PrivateRoute>
                    }
                  />
                </Route>

                <Route
                  path="*"
                  element={<Navigate to={getDefaultRoute(userRole)} replace />}
                />
              </Routes>
            </SessionManager>
          </UserContext.Provider>
        </Router>
      </ThemeProvider>
    );
  }

  // ============================================================
  // NOT AUTHENTICATED  — Login.jsx IS the landing page
  // ============================================================
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <UserContext.Provider value={userContextValue}>
          <SessionManager>
            <ToastContainer
              position="top-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="colored"
              limit={3}
            />
            <Routes>
              {/* Landing (Login.jsx) */}
              <Route path="/" element={<Login />} />

              {/* Same landing if someone types /login */}
              <Route path="/login" element={<Login />} />

              {/* Public Search — landing "Search" button lands here */}
              <Route path="/search" element={<PublicSearch />} />

              <Route path="/change-password" element={<ChangePassword />} />

              {/* Fallback → landing */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SessionManager>
        </UserContext.Provider>
      </Router>
    </ThemeProvider>
  );
}

export default App;