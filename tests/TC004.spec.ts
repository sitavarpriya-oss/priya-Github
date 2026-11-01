import {test} from '@playwright/test';
//import {Global} from '../lib/Global';  
import { General } from '../lib/General';

test('TC002-Verify add employee functionality',async({page})=>{
    const general1 = new General(page);
    await general1.openApplication();
    await general1.loginToApplication();
    await general1.waitTime();
    
    await general1.deleteEmployee();
    await general1.waitTime();
    await general1.logoutFromApplication();
});