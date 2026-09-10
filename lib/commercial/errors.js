export class CommercialError extends Error{
  constructor(code,status=400,details){
    super(code);
    this.name='CommercialError';
    this.code=code;
    this.status=status;
    if(details!==undefined)this.details=details;
  }
}

export function commercialError(code,status=400,details){
  return new CommercialError(code,status,details);
}

export function publicCommercialError(error){
  if(error instanceof CommercialError||typeof error?.code==='string'&&Number.isInteger(error?.status)){
    return{status:error.status,body:{ok:false,error:{code:error.code,message:error.code,...(error.details!==undefined?{details:error.details}:{})}}};
  }
  return{status:500,body:{ok:false,error:{code:'INTERNAL_ERROR',message:'Internal server error'}}};
}
