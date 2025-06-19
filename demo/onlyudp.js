const dgram = require('dgram')
const express = require('express')

const app1 = express()

const udpsocket = dgram.createSocket({type : 'udp4' , reuseAddr : true})

console.log('connecting')

// udpsocket.connect(42627 , "10.0.80.20" , ()=>{
//     console.log('connected')
// })

udpsocket.bind(5001 , ()=>{
    // udpsocket.addMembership("239.100.100.49")
    // udpsocket.setBroadcast(true)
})

// 10.0.80.20.42627

udpsocket.on('listening' , ()=>{
    console.log('udp is list')
})

udpsocket.on('error' , (e)=>{
    console.log('udp error')
})

udpsocket.on('message' , (msg , rinfo)=>{
    console.log(rinfo.address , rinfo.port , rinfo.size)
})

app1.listen(5001 , ()=>{
    console.log('server 5001')
})