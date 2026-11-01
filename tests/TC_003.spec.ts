import{test} from '@playwright/test';
//import {Global} from '../lib/Global';  
import { General } from '../lib/General';

test('TC003-Verify edit employee functionality',async({page})=>{
    const general1 = new General(page);

    await general1.openApplication();
    await general1.loginToApplication();
    await general1.waitTime();

    await general1.addNewEmployee();
    await general1.waitTime();
    await general1.editEmployee();
    
    await general1.waitTime();
    await general1.logoutFromApplication();
});
