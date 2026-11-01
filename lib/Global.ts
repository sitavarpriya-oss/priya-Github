//To provide test data and objects/elements related to whole application

import{Page} from '@playwright/test';

export class Global{  
   // readonly page: Page;  
    constructor(public page: Page) {
        this.page = page;
    }

    //test data
    public url:string = 'https://ctcorphyd.com/SureshIT/login.php';
    public username:string = 'sureshit';
    public password:string = 'sureshit';
        //add employee
    public empfirstname:string = 'Supriya';
    public emplastname:string = 'Sitawar';
    //edit employee
    public empfirstname_edited:string = 'Supriya Mahindrakar Edited'
    public emplastname_edited:string = 'Sitawar priya Edited'

    //objects/elements
    public username_txtbox          = '//input[@name="txtUserName"]';
    public password_txtbox          = '//input[@name="txtPassword"]';
    public login_btn                = '//input[@name="Submit"]';
    public logout_btn               = '//a[contains(text(),"Logout")]';

    //add employee
   public frame_empinfo            = '//iframe[@name="rightMenu"]';
    public addemp_btn               = '//input[@value="Add"]';
    public firstname_txtbox         = '//input[@name="txtEmpFirstName"]';
    public lastname_txtbox          = '//input[@name="txtEmpLastName"]';
   public save_btn                 = '//input[@value="Save"]';

    //edit employee
    public frame_empinfo_edit       = '//iframe[@name="rightMenu"]';
    public edit_btn                 ='//input[@id="btnEditPers"]';
   // public edit_btn                 = '//input[@name="EditMain" and @value="Edit"]';
    public firstname_txtbox_edited  = '//input[@name="txtEmpFirstName"]';
    public lastname_txtbox_edited   = '//input[@name="txtEmpLastName"]';
    //public save_btn_edited          = '//input[@value="Save"]';
    public save_btn_edited          = '//input[@id="btnEditPers"]';

    //delete employee
    public frame_empinfo_delete  ='//iframe[@name="rightMenu"]';
    public select_empinfo        ='//select[@id="loc_code"]';
   // public select_empId         ='//input[@text="Emp. ID"]';
    public search_empinfo         ='//input[@id="loc_name"]';
    public search_btn       ='//input[@value="Search"]';
    public chk_emp          ='//input[@value="1758"]';
    public delete_btn       ='//input[@value="Delete"]';

}
    