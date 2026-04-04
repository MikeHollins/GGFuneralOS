import * as cron from 'node-cron';
import { runComplianceScan } from '../agents/compliance/compliance-agent';
import { flagOverdueTasks } from '../agents/orchestrator/orchestrator';
import { processScheduledPosts } from '../agents/webmaster/social-publisher';
import { checkNudges } from '../agents/intake/intake-agent';

/**
 * Scheduled task runner — registers all cron jobs.
 * Call once at server startup.
 */
export function startCronJobs(sendSms: (to: string, body: string) => Promise<void>): void {
  console.log('[cron] Registering scheduled tasks...');

  // Every hour: compliance scan
  cron.schedule('0 * * * *', async () => {
    try {
      const alerts = await runComplianceScan();
      if (alerts.length > 0) console.log(`[cron] Compliance: ${alerts.length} alerts`);
    } catch (err: any) {
      console.error(`[cron] Compliance scan error: ${err.message}`);
    }
  });

  // Every hour: flag overdue tasks
  cron.schedule('30 * * * *', async () => {
    try {
      await flagOverdueTasks();
    } catch (err: any) {
      console.error(`[cron] Overdue flagging error: ${err.message}`);
    }
  });

  // Every 15 minutes: process scheduled social posts
  cron.schedule('*/15 * * * *', async () => {
    try {
      await processScheduledPosts();
    } catch (err: any) {
      console.error(`[cron] Social post error: ${err.message}`);
    }
  });

  // Every 2 hours: intake nudge checker
  cron.schedule('0 */2 * * *', async () => {
    try {
      await checkNudges(sendSms);
    } catch (err: any) {
      console.error(`[cron] Intake nudge error: ${err.message}`);
    }
  });

  // Daily 9am CT: payment follow-ups
  cron.schedule('0 14 * * *', async () => { // 14 UTC = 9am CT
    try {
      console.log('[cron] Running daily payment follow-up check');
      // TODO: implement paymentFollowUpCheck()
    } catch (err: any) {
      console.error(`[cron] Payment follow-up error: ${err.message}`);
    }
  });

  // Daily 10am CT: unsigned DocuSign reminders
  cron.schedule('0 15 * * *', async () => { // 15 UTC = 10am CT
    try {
      console.log('[cron] Running DocuSign reminder check');
      // TODO: implement docusignReminderCheck()
    } catch (err: any) {
      console.error(`[cron] DocuSign reminder error: ${err.message}`);
    }
  });

  // Daily 8am CT: aftercare touchpoints
  cron.schedule('0 13 * * *', async () => { // 13 UTC = 8am CT
    try {
      console.log('[cron] Running aftercare touchpoint check');
      // TODO: implement aftercareTouchpointCheck()
    } catch (err: any) {
      console.error(`[cron] Aftercare error: ${err.message}`);
    }
  });

  console.log('[cron] All scheduled tasks registered');
}
