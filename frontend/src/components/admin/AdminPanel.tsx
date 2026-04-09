import { useEffect, useState } from 'react';
import { useAdminStore } from '../../stores/adminStore';
import AdminLogin from './AdminLogin';
import AdminLayout from './AdminLayout';

export default function AdminPanel() {
  const { isAuthenticated, restore } = useAdminStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    restore();
    setChecked(true);
  }, [restore]);

  if (!checked) return null;

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  return <AdminLayout />;
}
