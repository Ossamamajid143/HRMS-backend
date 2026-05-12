import { workPolicy } from '../config/workPolicy';

export const calculateOvertime = (checkOutTime: Date): number => {
  const [endHour, endMinute] = workPolicy.endTime.split(':').map(Number);
  
  const checkOutHour = checkOutTime.getHours();
  const checkOutMinute = checkOutTime.getMinutes();
  
  const checkOutTotalMinutes = checkOutHour * 60 + checkOutMinute;
  const policyEndTotalMinutes = endHour * 60 + endMinute;
  
  const diff = checkOutTotalMinutes - policyEndTotalMinutes;
  return Math.max(0, diff);
};
