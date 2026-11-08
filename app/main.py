from fastapi import FastAPI 

 

app = FastAPI(title="KII Booking") 

 

@app.get("/") 

def root(): 
     return {"message": "KII Booking API"} 
@app.get("/health")
def health():
    return {"status": "ok"}