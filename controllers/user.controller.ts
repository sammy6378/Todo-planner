import { NextFunction, Request, Response } from "express";
import { catchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import validator from 'validator';
import { IUser, userModel } from "../models/userModel";
import jwt from 'jsonwebtoken';
import { sendMail } from "../utils/mail";

interface IRegisterUser {
    name: string;
    email: string;
    password: string;
}

// register
export const registerUser = catchAsyncErrors(async(req:Request, res: Response, next:NextFunction)=>{
    try {
        const { name, email, password } = req.body as IRegisterUser;

        if(!name || !email || !password){
            return next(new ErrorHandler('Please enter all fields', 400));
        }

        // validate email
        const isEmailValid = validator.isEmail(email);
        if(!isEmailValid){
            return next(new ErrorHandler('Invalid Email', 400));
        }

        // validate password
        const checkPassword = validator.isStrongPassword(password);
        if(!checkPassword){
            return next(new ErrorHandler('Password must be at least 8 characters long and contain at least 1 lowercase, 1 uppercase, 1 number and 1 special character', 400));
        }

        // check if email exists
        const emailExists = await userModel.findOne({email});
        if(emailExists){
            return next(new ErrorHandler('Email already exists', 400));
        }


        const user: IRegisterUser ={
            name,
            email,
            password
        }

        // create activation token
        const activationToken = createActivationToken(user);
        const activationCode = activationToken.activationCode;

        // send email
        const data = { user: { name: user.name}, activationCode};
        try {
            // send email
            await sendMail({
                template: 'activateEmail.ejs',
                email: user.email,
                subject: 'Account Activation',
                data
            });

            res.status(201).json({
                success: true,
                message: `Activation code sent to ${user.email}`,
                activationToken: activationToken.token,
            });
            
        } catch (error:any) {
            return next(new ErrorHandler(error.message, 500));  
        }
        
    } catch (error:any) {
        return next(new ErrorHandler(error.message, 500));
    }
})


// create activation token
interface IActivationToken {
    activationCode: string;
    token: string;
  }
const createActivationToken = (user: IRegisterUser): IActivationToken => {
    // activation code
    const activationCode = Math.floor(Math.random() * 9000 + 1000).toString(); // 4 digit code
    const token = jwt.sign(
        {user,activationCode},
         process.env.ACTIVATION_SECRET as string,
        {expiresIn: '5m'});

    return {activationCode, token};
}



// activate user
export const activateUser = catchAsyncErrors(async(req: Request, res: Response, next:NextFunction)=>{
    try {
        const { activation_token, activation_code } = req.body;

        const verifyToken = jwt.verify(activation_token, process.env.ACTIVATION_SECRET as string) as {user: IUser; activationCode: string};
        if(activation_code !== verifyToken.activationCode){
            return next(new ErrorHandler('Invalid Activation Code', 400));
        }

        const newUser = verifyToken.user;
        const user = await userModel.create({
            name: newUser.name,
            email: newUser.email,
            password: newUser.password
        })

        res.status(201).json({
            success: true,
            user,
            message: 'Account activated successfully',
        });
    } catch (error:any) {
        return next(new ErrorHandler(error.message, 500));  
    }
});