import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/apiResponse.js"

const registerUser = asyncHandler(async(req, res) => {
    // get user details from frontend
    // validate - not empty
    // check if the user already exists
    // check for images, check for avatar
    // upload them on cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token feild
    // check for user creation
    // retrun response if user created otherwise return null

    const {fullname, email, username, password } = req.body

    if([fullname, email, username, password].some((field)=>(
        field?.trim() === ""
    ))){
        throw new ApiError(400, 'All fields are required')
    }

   const existedUser = await User.findOne({$or:[{username}, {email}]})

   if(existedUser){
    throw new ApiError(409, 'User already exists')
   }


  const avatarLocalPath = req.files?.avatar[0]?.path
  const coverimageLocalPath = req.files?.coverimage[0]?.path

  if(!avatarLocalPath){
    throw new ApiError(400, "Avatar file is required")
  }

 const avatar = await uploadOnCloudinary(avatarLocalPath)
 const coverimage = await uploadOnCloudinary(coverimageLocalPath)

 if(!avatar){
    throw new ApiError(400, "Avatar file is required")
 }

const user = await User.create({
    fullname,
    avatar : avatar.url,
    coverimage: coverimage?.url || "",
    email,
    password,
    username : username.toLowerCase()
})

const createdUser = await User.findById(user._id).select("-password -refreshtoken")

if(createdUser){
    throw new ApiError(500, "something went wrong while registring the user")
}

return res.status(201).json(
    new ApiResponse(200, createdUser, "User registered successfully")
)


})

export {registerUser}