import {test} from '@playwright/test';
//import {Global} from '../lib/Global';  
import { General } from '../lib/General';


test('TC001-Verify login functionality',async({page})=>{
    
    const general1 = new General(page);
    await general1.openApplication();
    await general1.loginToApplication();
    await general1.logoutFromApplication();
});


