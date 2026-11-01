//To provide all reusable methods /functions related to whole application
import {Page} from '@playwright/test';
import {Global} from './Global';

export class General extends Global {
    
    //user defined methods/functions
    //open application
    async openApplication(){
        await this.page.goto(this.url);
        console.log("Application opened successfully");
    }
    //login to application
    async loginToApplication(){
        await this.page.locator(this.username_txtbox).fill(this.username);
        await this.page.locator(this.password_txtbox).fill(this.password);
        await this.page.locator(this.login_btn).click();

        console.log("Login to application successfully");
    }
    //logout from application
    async logoutFromApplication(){
        //await this.page.locator(this.logout_btn).waitFor({state:'visible',timeout:5000});
        await this.page.locator(this.logout_btn).click();
        console.log("Logout from application successfully");
    }

    //delete employee
    public async deleteEmployee(){
        
         const frame = this.page.frameLocator(this.frame_empinfo_delete);
        // await frame.locator(this.select_empinfo).click();
         await frame.locator(this.select_empinfo).selectOption({label:'Emp. ID'});
        // await frame.locator(this.search_empinfo).click();
         await frame.locator(this.search_empinfo).fill('17585');
         await frame.locator(this.search_btn).click();
         console.log('Employee search done')
         await frame.locator(this.chk_emp).waitFor({state:'visible',timeout:10000});
         await frame.locator(this.chk_emp).check();
         console.log('Emp check done')
         await frame.locator(this.delete_btn).click();
         console.log('Employee deleted successfully');
        
    }


    //add employee
   public async addNewEmployee(){
         const frame = this.page.frameLocator(this.frame_empinfo);
        await frame.locator(this.addemp_btn).click();
        await frame.locator(this.firstname_txtbox).fill(this.empfirstname);
        await frame.locator(this.lastname_txtbox).fill(this.emplastname);
        await frame.locator(this.save_btn).click();
        console.log("New employee added successfully");
   }

        //edit employee
        public async editEmployee(){
        const frame = this.page.frameLocator(this.frame_empinfo_edit);
        console.log("edit employee started");
        //console.log("Edit button count:",await frame.locator(this.edit_btn).count());
        //console.log("Edit button isvisible:",await frame.locator(this.edit_btn).isVisible());
       // console.log("Edit button isenabled:",await frame.locator(this.edit_btn).isEnabled());
       // console.log("first name field count:",await frame.locator(this.firstname_txtbox_edited).count());
       // await this.edit_btn.click();

    //click on edit button and update employee details
        //edit employee details
        await frame.locator(this.edit_btn).click();
        await frame.locator(this.firstname_txtbox_edited).fill(this.empfirstname_edited);
        await frame.locator(this.lastname_txtbox_edited).fill(this.emplastname_edited);
        //save the updated employee details
        await frame.locator(this.save_btn_edited).click();
        console.log("Employee details updated successfully");
    } 
       
    public async waitTime(){
        await this.page.waitForTimeout(3000);
    }
} 