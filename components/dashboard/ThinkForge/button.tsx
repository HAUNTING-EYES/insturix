import React from 'react'
import ShinyText from './shiny'

const Button = () => {
  return (
    <div className="w-full flex justify-center items-center ">
      <button className="mt-8 fixed top-1 right-1 -translate-x-10 -translate-y-1 px-10 py-1 rounded-lg 
  bg-black text-transparent bg-clip-text 
  bg-gradient-to-r from-red-400 to-red-600 
  border border-red-700/30 
  hover:scale-105 transition-all duration-200 ease-in-out 
  shadow-md shadow-red-900/20">
        <ShinyText text="Work on my idea!" disabled={false} speed={10}/>
      </button>
    </div>
  )
}

export default Button