//TestSuite for PW_Hybrid
import{test} from '@playwright/test';
import { General } from '../lib/General';

test.describe('Test suite for PW_Hybrid', () => {
    
test('TC001-Verify login functionality',async({page})=>{
    const general1 = new General(page);
    await general1.openApplication();
    await general1.loginToApplication();
    await general1.logoutFromApplication();
});


test('TC002-Verify add employee functionality',async({page})=>{
    const general1 = new General(page);
    await general1.openApplication();
    await general1.loginToApplication();
    await general1.waitTime();
    await general1.addNewEmployee();
    await general1.logoutFromApplication();
});
});
