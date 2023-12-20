import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating acces and refresh token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validate - not empty
  // check if the user already exists
  // check for images, check for avatar
  // upload them on cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token feild
  // check for user creation
  // retrun response if user created otherwise return null

  const { fullname, email, username, password } = req.body;

  if (
    [fullname, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  //   const coverimageLocalPath = req.files?.coverimage[0]?.path
  let coverimageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverimage) &&
    req.files.coverimage.length > 0
  ) {
    coverimageLocalPath = req.files.coverimage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverimage = await uploadOnCloudinary(coverimageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverimage: coverimage?.url || "",
    email,
    password,
    username,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "something went wrong while registring the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // req body -> data
  // username or email
  // find the user
  // password check
  // access and refresh token
  // send cookie
  // send response

  const { email, username, password } = req.body;

  if ((!username || !email) && !password) {
    throw new ApiError(400, "user name or password is required");
  }

  const user = await User.findOne({ $or: [{ username }, { email }] });

  if (!user) {
    throw new ApiError(404, "user doesn't exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedinUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedinUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: undefined },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
  .status(200)
  .clearCookie("accessToken", options)
  .clearCookie("refreshToken", options)
  .json(new ApiResponse(200, {}, "User logout successfully"))
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken){
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
  
    const user = await User.findById(decodedToken?._id);
  
    if(!user){
      throw new ApiError(401, "Invalid refresh token")
    }
  
    if(incomingRefreshToken !== user?.refreshToken){
      throw new ApiError(401, "Refresh token is expired or used")
    }
  
    const options = {
      httpOnly: true,
      secure:true
    }
  
    const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
  
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newRefreshToken, options)
    .json(
      new ApiResponse(
        200,
        {accessToken, refreshToken: newRefreshToken},
        "Access token refreshed successfully"
      )
    )
  } catch (error) {
    throw new ApiError(401, error.message || "Invalid refresh token")
  }
  
})

const changeCurrentPassword = asyncHandler(async(req, res)=>{
  const {oldPassword, newPassword} = req.body;

  const user = await User.findById(req.user?._id)
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if(isPasswordCorrect){
    throw new ApiError(400, "Invalid old password")
  }

  user.password = newPassword

  await user.save({validateBeforeSave:false})

  return res
  .status(200)
  .json(new ApiResponse(200, {}, "Password change successfully"))
})


const getCurrentUser = asyncHandler(async (req, res)=>{
  return res
  .status(200)
  .json(200, req.user, "Current user fetched successfully")
})

const updateAccountDetails = asyncHandler(async(req, res)=>{
  const {fullname, email} = req.body

  if(!fullname || !email){
    throw new ApiError(400, "All fields are required")
  }

  const user = User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullname,
        email
      }
    },
    {new:true}
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req, res)=>{
 const avatarLocalPath =  req.file?.path

 if(!avatarLocalPath){
  throw new ApiError(400, "Avatar file is missing")
 }

 const avatar = await uploadOnCloudinary(avatarLocalPath)

 if(!avatar.url){
  throw new ApiError(400, "Error while uploading avatar")
 }

 const user = await User.findByIdAndUpdate(
  req.user?._id,
  {
    $set:{
      avatar: avatar.url
    }
  },
  {new:true}
 ).select("-password")

 return res
 .status(200)
 .json(
  new ApiResponse(200, user, "avatar updated successfully")
 )

})

const updateUserCoverImage = asyncHandler(async(req, res)=>{
 const coverImageLocalPath =  req.file?.path

 if(!coverImageLocalPath){
  throw new ApiError(400, "Avatar file is missing")
 }

 const coverImage = await uploadOnCloudinary(coverImageLocalPath)

 if(!coverImage.url){
  throw new ApiError(400, "Error while uploading cover Image")
 }

 const user = await User.findByIdAndUpdate(
  req.user?._id,
  {
    $set:{
      coverimage: coverImage.url
    }
  },
  {new:true}
 ).select("-password")

 return res
 .status(200)
 .json(
  new ApiResponse(200, user, "CoverImage updated successfully")
 )

})


export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage };
