import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { toast } from './utils/toast';
import './index.css';

import Layout from './Layout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Parameters from './pages/Parameters';
import Devices from './pages/Devices';
import Formatters from './pages/Formatters';
import Dynamic from './pages/Dynamic';
import Pages from './pages/Pages';
import Users from './pages/Users';
import ParamMapping from './pages/ParamMapping';
import JsonMapping from './pages/JsonMapping';
import Scheduler from './pages/Scheduler';
import ErrorPage from './pages/Error';
import Events from './pages/Events';
import Alerts from './pages/Alerts';
import Login from './pages/Login';
import ApiLogs from './pages/ApiLogs';
import ApiMonitor from './pages/ApiMonitor';

export default function App() {
  const [dbStatus, setDbStatus] = useState<string>("Disconnected");
  const [latestData, setLatestData] = useState<string>("Awaiting IoT payload...");

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:8381/ws`);

    ws.onopen = () => {
      setDbStatus("Connected");
    };

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.event === "new_data") {
        setLatestData(JSON.stringify(payload.data, null, 2));
        toast.info(`New Data from ${payload.deviceid}`, { theme: "light" });
      }
    };

    ws.onclose = () => {
      setDbStatus("Disconnected");
    };

    return () => ws.close();
  }, []);

  return (
    <BrowserRouter>
      <ToastContainer position="top-right" autoClose={2000} hideProgressBar={false} closeOnClick pauseOnHover theme="colored" />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<Layout wsStatus={dbStatus} />}>
          <Route path="/dashboard" element={<Dashboard latestData={latestData} />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/parameters" element={<Parameters />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/formatters" element={<Formatters />} />
          <Route path="/dynamic" element={<Dynamic />} />
          <Route path="/pages" element={<Pages />} />
          <Route path="/users" element={<Users />} />
          <Route path="/param-mapping" element={<ParamMapping />} />
          <Route path="/json-mapping" element={<JsonMapping />} />
          <Route path="/scheduler" element={<Scheduler />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/error" element={<ErrorPage />} />
          <Route path="/events" element={<Events />} />
          <Route path="/api-logs" element={<ApiLogs />} />
          <Route path="/api-monitor" element={<ApiMonitor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
