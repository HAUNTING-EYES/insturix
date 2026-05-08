import React from 'react'
import ShinyText from './shiny'

const Button = () => {
  return (
    <div className="w-full flex justify-center items-center ">
      <button className="mt-8 fixed top-1 right-1 -translate-x-10 -translate-y-1 px-10 py-1 rounded-lg 
  bg-black text-transparent bg-clip-text 
  bg-gradient-to-r from-[#D4A652] to-[#D4A652] 
  border border-[#D4A652]/30 
  hover:scale-105 transition-all duration-200 ease-in-out 
  shadow-md shadow-[#D4A652]/20">
        <ShinyText text="Work on my idea!" disabled={false} speed={10}/>
      </button>
    </div>
  )
}

export default Button