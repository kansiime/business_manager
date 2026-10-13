
'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useUser } from '@/lib/useUser';
import { useTenantContext } from '@/lib/useTenantContext';

import AdminDashboard       from './dashboards/AdminDashboard';
import AccountantDashboard  from './dashboards/AccountantDashboard';
import CashierDashboard     from './dashboards/CashierDashboard';
import StorekeeperDashboard from './dashboards/StorekeeperDashboard';
import DoctorDashboard      from './dashboards/DoctorDashboard';
import NurseDashboard       from './dashboards/NurseDashboard';
import LabDashboard         from './dashboards/LabDashboard';
import PharmacistDashboard  from './dashboards/PharmacistDashboard';
import ReceptionDashboard   from './dashboards/ReceptionDashboard';
import SuperDashboard       from './dashboards/SuperDashboard';

export default function Dashboard() {
  const user = useUser();
  const { pages, ready } = useTenantContext();

  if (!user || !ready) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading…</p>
      </ProtectedRoute>
    );
  }

  const role = user.role;
  const hasClinic =
    pages.includes('appointments') || pages.includes('prescriptions');

  // Decide which dashboard to render.
  // Rules:
  //   - super → platform dashboard
  //   - clinic roles → clinic dashboards, but only if the tenant
  //     actually has clinic features enabled
  //   - non-clinic roles → their own dashboard (they're feature-agnostic)
  //   - anything else → generic AdminDashboard, which itself adapts
  //     to whichever features the tenant has
  let Dashboard = AdminDashboard;

  if (role === 'super') {
    Dashboard = SuperDashboard;
  } else if (hasClinic) {
    if (role === 'pharmacist') Dashboard = PharmacistDashboard;
    else if (role === 'doctor') Dashboard = DoctorDashboard;
    else if (role === 'nurse' || role === 'midwife') Dashboard = NurseDashboard;
    else if (role === 'lab_tech' || role === 'radiologist') Dashboard = LabDashboard;
    else if (role === 'receptionist') Dashboard = ReceptionDashboard;
    else if (role === 'cashier') Dashboard = CashierDashboard;
    else if (role === 'storekeeper') Dashboard = StorekeeperDashboard;
    else if (role === 'accountant') Dashboard = AccountantDashboard;
  } else {
    if (role === 'cashier') Dashboard = CashierDashboard;
    else if (role === 'storekeeper') Dashboard = StorekeeperDashboard;
    else if (role === 'accountant') Dashboard = AccountantDashboard;
  }

  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}