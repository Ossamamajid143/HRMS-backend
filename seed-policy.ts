import { db } from './src/config/db';
import { workPolicies, employees } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('Seeding default work policy...');
  
  try {
    // 1. Insert default policy
    const [defaultPolicy] = await db.insert(workPolicies).values({
      name: 'Standard Shift',
      checkInTime: '09:00',
      checkOutTime: '17:00',
      graceMinutes: 15,
    }).onConflictDoNothing().returning();

    let policyId;
    if (defaultPolicy) {
      policyId = defaultPolicy.id;
    } else {
      const existing = await db.select().from(workPolicies).where(eq(workPolicies.name, 'Standard Shift')).limit(1);
      policyId = existing[0].id;
    }

    console.log(`Default policy created/found with ID: ${policyId}`);

    // 2. Link all employees to this policy
    console.log('Linking all employees to the default policy...');
    await db.update(employees).set({ workPolicyId: policyId });

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
